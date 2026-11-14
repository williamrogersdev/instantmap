import { defineInstantMap } from "instantmap-js";
import { render } from "solid-js/web";
import { App } from "./app";

defineInstantMap();
render(() => <App />, document.getElementById("root")!);
