import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CALL_CHANNEL, eventChannel, type KorevBridge } from './shared/api';

const bridge: KorevBridge = {
  call: (method, args) => ipcRenderer.invoke(CALL_CHANNEL, method, args),
  on(event, listener) {
    const channel = eventChannel(event);
    const forward = (
      _event: IpcRendererEvent,
      payload: Parameters<typeof listener>[0],
    ) => listener(payload);
    ipcRenderer.on(channel, forward);
    return () => {
      ipcRenderer.removeListener(channel, forward);
    };
  },
};

contextBridge.exposeInMainWorld('korev', bridge);
