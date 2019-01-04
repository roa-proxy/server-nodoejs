import * as cla from "command-line-args";
import App from "./App";

const argv = cla([
	{ name: "config", type: String, defaultOption: true, defaultValue: "config.json" },
]);
App.run(argv.config);
