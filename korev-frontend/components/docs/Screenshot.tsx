import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { screenshotPath } from './screenshot-path';

const SCREENSHOT_WIDTH = 1440;
const SCREENSHOT_HEIGHT = 900;
const IMAGE_CLASS = 'm-0 w-full';

export function Screenshot({ name, alt }: { name: string; alt: string }) {
  const image = {
    alt,
    width: SCREENSHOT_WIDTH,
    height: SCREENSHOT_HEIGHT,
  };
  return (
    <figure className="not-prose my-6 overflow-hidden rounded-xl border border-fd-border shadow-lg">
      <ImageZoom
        {...image}
        src={screenshotPath(name, 'light')}
        className={`${IMAGE_CLASS} block dark:hidden`}
      />
      <ImageZoom
        {...image}
        src={screenshotPath(name, 'dark')}
        className={`${IMAGE_CLASS} hidden dark:block`}
      />
    </figure>
  );
}
