import { readFile } from "fs";
import Server from "./Server";

export default class App {
	public static async run(config: string) {
		try {
			App.config = await App.readConfig(config);
			await App.runServer();
		} catch (e) {
			if (e instanceof Error) {
				console.error(e.message);
				console.error(e.stack);
			} else {
				console.error(e);
			}
			process.exit(1);
		}
	}
	private static config: any;
	private static server: Server;
	private static runServer() {
		App.server = new Server(this.config);
		return App.server.run();
	}
	private static readConfig(config: string) {
		return new Promise((resolve, reject) => {
			readFile(config, (err, data) => {
				if (err) {
					return reject(err);
				}
				const json = JSON.parse(data.toString("utf8"));
				resolve(json);
			});
		});
	}
}
