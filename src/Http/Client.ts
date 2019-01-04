import { EventEmitter } from "events";
import * as net from "net";
import * as stream from "stream";
import * as tls from "tls";
import IProxyClient from "../IProxyClient";
import HttpException from "./HttpException";
import { getHttpMessage, IHttpRequestHeader, parseAuthHttpHeader, parseCookieHttpHeader, parseHttpRequestLines } from "./util";

export default class Client extends EventEmitter  implements IProxyClient {
	public constructor(private socket: net.Socket | tls.TLSSocket) {
		super();
	}
	public listenForRequest() {
		this.socket.once("data", (buffer: Buffer) => {
			try {
				const endOfHeader = buffer.indexOf("\r\n\r\n");
				if (endOfHeader === -1) {
					throw new HttpException(400);
				}
				const headers = parseHttpRequestLines(buffer.slice(0, endOfHeader + 4).toString());
				buffer = undefined;
				if (headers.authorization === undefined) {
					throw new HttpException(401);
				}
				const auth = parseAuthHttpHeader(headers.authorization);
				if (!auth) {
					throw new HttpException(401);
				}
				const cb = (result: boolean) => {
					try {
						if (!result) {
							throw new HttpException(401);
						}
						this.afterSuccessfullAuth(headers);
					} catch (e) {
						if (e instanceof HttpException) {
							this.sendException(e);
						} else {
							this.sendException(new HttpException(500));
							console.error(e, e.message);
						}
					}
				};
				this.emit("auth", auth.username, auth.password, cb);
			} catch (e) {
				if (e instanceof HttpException) {
					this.sendException(e);
				} else {
					this.sendException(new HttpException(500));
					console.error(e, e.message);
				}
			}
		});
	}
	public pipe(peer: stream.Duplex) {
		this.socket.pipe(peer);
		peer.pipe(this.socket);
		this.socket.on("end", () => {
			peer.destroy();
		});
		peer.on("close", () => {
			this.socket.destroy();
		});
	}
	private afterSuccessfullAuth(headers: IHttpRequestHeader) {
		if (headers.cookie === undefined) {
			throw new HttpException(404);
		}
		const cookies = parseCookieHttpHeader(headers.cookie);
		if (cookies.PHPSESSID === undefined) {
			throw new HttpException(404);
		}
		const addressPeer = Buffer.from(cookies.PHPSESSID, "base64").toString("utf8").split(":", 2);
		if (addressPeer.length !== 2) {
			throw new HttpException(404);
		}
		const cb = (httpCode: number) => {
			this.socket.write(`${headers.protocol} ${httpCode} ${getHttpMessage(httpCode)}\r\n\r\n`);
		};
		const address = addressPeer[0];
		const port = parseInt(addressPeer[1], 10);
		this.emit("request", address, port, cb);
	}
	private sendException(e: HttpException) {
		const authHeader = e.code === 401 ? "www-authenticate: Basic\r\n" : "";
		this.socket.write(
			`HTTP/1.1 ${e.code} ${e.message}\r\n` +
			`Connection: close\r\n` +
			authHeader +
			`\r\n` +
`<html>
<head><title>${e.code} ${e.message}</title></head>
<body>
<center><h1>${e.code} ${e.message}</h1></center>
<hr><center>nginx/1.15.5</center>
</body>
</html>`
			, () => {
				this.socket.destroy();
		});
		console.error(`HTTP/1.0 ${e.code} ${e.message}`, e.stack);
	}
}
