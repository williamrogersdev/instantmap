import type { InstantMapElement, InstantMapEventMap, Marker } from "instantmap";
import "solid-js";

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      "instant-map": JSX.HTMLAttributes<InstantMapElement> & {
        ref?: InstantMapElement | ((element: InstantMapElement) => void);
        "attr:src"?: string;
        "attr:center"?: string;
        "attr:zoom"?: number | string;
        "prop:markers"?: Marker[];
        "on:markerclick"?: (event: InstantMapEventMap["markerclick"]) => void;
      };
    }
  }
}
