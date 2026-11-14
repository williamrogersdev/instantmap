// Copies the script-tag build of the package into the site's public folder.
import { $ } from "bun";

const from = new URL("../packages/instantmap/dist/cdn/", import.meta.url).pathname;
const to = new URL("../site/public/", import.meta.url).pathname;
await $`rm -rf ${to}im ${to}instant-map.js ${to}instant-map.js.map`;
await $`mkdir -p ${to}im`;
await $`cp ${from}instant-map.js ${from}instant-map.js.map ${to}`;
await $`cp -R ${from}im/. ${to}im/`;
