import { build as electronBuild } from "electron-builder";
await electronBuild({ publish: "never" });
