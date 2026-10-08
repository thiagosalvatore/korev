package main

import (
	"context"
	"encoding/json"
	"flag"
	"io"
	"log"
	"net"
	"os"

	"tailscale.com/client/local"
	"tailscale.com/ipn"
	"tailscale.com/tsnet"
)

const loopbackHost = "127.0.0.1"

type status struct {
	IP       string `json:"ip"`
	LoginURL string `json:"loginUrl"`
}

func main() {
	stateDir := flag.String("state-dir", "", "directory that keeps this device's Tailscale identity")
	hostname := flag.String("hostname", "korev", "device name on the tailnet")
	port := flag.String("port", "", "port to accept on the tailnet and forward to on loopback")
	flag.Parse()

	exitWhenStdinCloses()

	server := &tsnet.Server{Dir: *stateDir, Hostname: *hostname, Logf: log.Printf}
	if err := server.Start(); err != nil {
		log.Fatal(err)
	}
	listener, err := server.Listen("tcp", ":"+*port)
	if err != nil {
		log.Fatal(err)
	}
	go forwardAll(listener, net.JoinHostPort(loopbackHost, *port))

	client, err := server.LocalClient()
	if err != nil {
		log.Fatal(err)
	}
	log.Fatal(reportStatus(server, client))
}

func exitWhenStdinCloses() {
	go func() {
		io.Copy(io.Discard, os.Stdin)
		os.Exit(0)
	}()
}

func forwardAll(listener net.Listener, target string) {
	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Fatal(err)
		}
		go forward(conn, target)
	}
}

func forward(conn net.Conn, target string) {
	defer conn.Close()
	upstream, err := net.Dial("tcp", target)
	if err != nil {
		log.Print(err)
		return
	}
	defer upstream.Close()
	go io.Copy(upstream, conn)
	io.Copy(conn, upstream)
}

func reportStatus(server *tsnet.Server, client *local.Client) error {
	watcher, err := client.WatchIPNBus(context.Background(), ipn.NotifyInitialState)
	if err != nil {
		return err
	}
	defer watcher.Close()

	output := json.NewEncoder(os.Stdout)
	current := status{}
	for {
		notify, err := watcher.Next()
		if err != nil {
			return err
		}
		next := current
		if notify.BrowseToURL != nil {
			next.LoginURL = *notify.BrowseToURL
		}
		if notify.State != nil {
			next.IP = ""
			if *notify.State == ipn.Running {
				ip4, _ := server.TailscaleIPs()
				next.IP = ip4.String()
				next.LoginURL = ""
			}
		}
		if next == current {
			continue
		}
		current = next
		if err := output.Encode(current); err != nil {
			return err
		}
	}
}
