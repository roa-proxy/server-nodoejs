import * as net from "net";
import { Socket } from "net";
import { Duplex } from "stream";
import { connect as TLSConnect, TLSSocket } from "tls";
import { IUpstream } from "../Server";
import HttpException from "./HttpException";
import ProtocolHttpException from "./ProtocolHttpException";
import { parseHttpResponseLines } from "./util";

export default class HttpUpstream {
	public static async connect(upstream: IUpstream) {
		const connection = new HttpUpstream(upstream);
		await connection.open();
		return connection;
	}
	public static httpRequestFor(upstream: IUpstream, address: string, port: number) {
		const authorization = upstream.username ? `Authorization: Basic ${Buffer.from(upstream.username + ":" + upstream.password).toString("base64")}\r\n` : "";
		return `GET / HTTP/1.1\r\n` +
			   `Connection: Keep-Alive\r\n` +
			   authorization +
			   `Cookie: PHPSESSID=${Buffer.from(address + ":" + port).toString("base64")}\r\n` +
			   `\r\n`;
	}
	private socket: Socket | TLSSocket;
	public constructor(private upstream: IUpstream) {

	}
	public connectTo(address: string, port: number): Promise<Duplex> {
		return new Promise((resolve, reject) => {
			this.socket.write(HttpUpstream.httpRequestFor(this.upstream, address, port), () => {
				this.socket.once("data", (data) => {
					const endOfHeader = data.indexOf("\r\n\r\n");
					if (endOfHeader === -1) {
						return reject(new ProtocolHttpException(data, "there is no end of header"));
					}
					const header = parseHttpResponseLines(data.slice(0, endOfHeader + 4).toString("utf8"));
					if (!header) {
						return reject(new ProtocolHttpException(data, "cannot parse response header"));
					}
					const code = parseInt(header.code, 10);
					if (code === 100 || code === 101 || code === 200 || code === 202) {
						return resolve(this.socket);
					}
					reject(new HttpException(code, header.message));
				});
			});
		});
	}
	private open() {
		return new Promise((resolve, reject) => {
			if (this.upstream.protocol === "http") {
				this.socket = net.connect(this.upstream.port, this.upstream.ip, resolve);
			} else {
				this.socket = TLSConnect(this.upstream.port, this.upstream.ip, {rejectUnauthorized: false}, resolve);
			}
			this.socket.on("error", reject);
		});
	}
}
