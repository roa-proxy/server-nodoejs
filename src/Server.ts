import { EventEmitter } from "events";
import * as fs from "fs";
import * as net from "net";
import * as tls from "tls";
import HttpClient from "./Http/Client";
import HttpUpstream from "./Http/HttpUpstream";
import SocksClient, { RequestResult } from "./Socks/Client";

export interface IUser {
	username: string;
	password: string;
}
export interface IUpstream {
	protocol: "http" | "https" | "socks";
	ip: string;
	port: number;
	username?: string;
	password?: string;
}
export interface IListenableServerOptions {
	/**
	 * server ips to listen
	 * @default undefined run on any available ip
	 */
	ip?: string[];
	/**
	 * the port which listen for the protocol
	 */
	port?: number;
}
export interface ISocksServerOptions extends IListenableServerOptions {
}
export interface IHttpServerOptions extends IListenableServerOptions {
	/**
	 * domain name for requests
	 */
	host?: string;
}
export interface IHttpsServerOptions extends IHttpServerOptions {
	/**
	 * path to certification file
	 */
	cert: string;

	/**
	 * path to private key file
	 */
	key: string;
}
export interface IOptions {
	/**
	 * Http server settings
	 */
	http?: IHttpServerOptions;
	/**
	 * Https server settings
	 */
	https?: IHttpsServerOptions;

	/**
	 * Socks5 server settings
	 */
	socks?: ISocksServerOptions;

	/**
	 * list of users
	 * @default [] no user
	 */
	users?: IUser[];

	/**
	 * Upstream proxies for pass the connection
	 * @default undefined connecting directly to client provided address
	 */
	upstream?: IUpstream[];
}
export default class Server extends EventEmitter {
	private options: IOptions;
	private http: net.Server;
	private https: tls.Server;
	private socks: net.Server;
	public constructor(options?: IOptions) {
		super();
		if (options === undefined) {
			options = {};
		}
		if (options.http && options.http.port === undefined) {
			options.http.port = 80;
		}
		if (options.https && options.https.port === undefined) {
			options.https.port = 443;
		}
		if (options.socks && options.socks.port === undefined) {
			options.socks.port = 1080;
		}
		this.options = options;
	}
	public run() {
		const promises: Array<Promise<void>> = [];
		if (this.options.http) {
			promises.push(this.runHttpServer());
		}
		if (this.options.https) {
			promises.push(this.runHttpsServer());
		}
		if (this.options.socks) {
			promises.push(this.runSocksServer());
		}
		return Promise.all(promises);
	}
	public async auth(username: string, password: string) {
		if (!this.options.users || !this.options.users.length) {
			return true;
		}
		for (const user of this.options.users) {
			if (user.username === username) {
				return user.password === password;
			}
		}
		return false;
	}
	private runHttpServer() {
		this.http = new net.Server((socket) => {
			this.handleHttpSocket(socket);
		});
		return this.listenServer(this.http, this.options.http);
	}
	private runHttpsServer(): Promise<void> {
		return new Promise((resolve, reject) => {
			fs.readFile(this.options.https.key, "utf8", (errKey, key) => {
				if (errKey) {
					return reject(errKey);
				}
				fs.readFile(this.options.https.cert, "utf8", (errCert, cert) => {
					if (errCert) {
						return reject(errCert);
					}
					this.https = tls.createServer({
						key: key,
						cert: cert,
					}, (socket) => {
						this.handleHttpSocket(socket);
					});
					return this.listenServer(this.https, this.options.https);
				});
			});
		});
	}

	private runSocksServer() {
		this.socks = new net.Server((socket) => {
			socket.setTimeout(30);
			const client = new SocksClient(socket);
			client.on("auth", async (username: string, password: string, cb: (result: boolean) => void) => {
				cb(await this.auth(username, password));
			});
			client.on("request", async (address: string, port: number, cb: (result: RequestResult) => void) => {
				try {
					const peer = await this.connectTo(address, port);
					if (!peer) {
						return cb(RequestResult.Failure);
					}
					cb(RequestResult.OK);
					client.pipe(peer);
				} catch (e) {
					cb(RequestResult.Failure);
					console.error(`error caout in connecting to ${address}:${port}, error = `, e);
				}
			});
			client.listenForAuth();
		});
		return this.listenServer(this.socks, this.options.socks);
	}
	private async connectTo(address: string, port: number) {
		if (this.options.upstream) {
			for (const upstream of this.options.upstream) {
				try {
					const socket = await this.connectUsingUpstream(upstream, address, port);
					if (socket) {
						return socket;
					}
				} catch (e) {
					console.warn(`error caout in connecting to ${address}:${port} using upstream:`, upstream, "error = ", e);
				}
			}
		} else {
			return new Promise<net.Socket>((resolve, reject) => {
				const socket = net.connect(port, address, () => {
					resolve(socket);
				});
				socket.on("error", reject);
			});
		}
	}
	private async connectUsingUpstream(upstream: IUpstream, address: string, port: number) {
		if (upstream.protocol === "http" || upstream.protocol === "https") {
			const controller = await HttpUpstream.connect(upstream);
			return controller.connectTo(address, port);
		}
	}
	private listenServer(server: net.Server, options: IListenableServerOptions): Promise<void> {
		if (!options.ip) {
			return new Promise((resolve) => {
				server.listen(options.port, resolve);
			});
		}
		const listenPromises: Array<Promise<void>> = [];
		for (const ip of options.ip) {
			const promise = new Promise<void>((resolve) => {
				server.listen(options.port, ip, resolve);
			});
			listenPromises.push(promise);
		}
		return Promise.all(listenPromises) as any;
	}
	private handleHttpSocket(socket: net.Socket | tls.TLSSocket) {
		socket.setTimeout(30);
		const client = new HttpClient(socket);
		client.listenForRequest();
		client.on("auth", async (username: string, password: string, cb: (result: boolean) => void) => {
			cb(await this.auth(username, password));
		});
		client.on("request", async (address: string, port: number, cb: (httpCode: number) => void) => {
			const peer = await this.connectTo(address, port);
			if (!peer) {
				return cb(500);
			}
			cb(200);
			client.pipe(peer);
		});
	}
}
