import { EventEmitter } from "events";
import * as net from "net";
import * as stream from "stream";
import IProxyClient from "../IProxyClient";
import ProtocolException from "./ProtocolException";

enum AddressType {
	IPv4,
	Domain,
	IPv6,
}
enum AuthMethod {
	NoAuth,
	GSSAPI,
	Password,
	IANA,
}
enum InitStage {
	Greeting,
	Auth,
	Command,
	ConnectUpstream,
}
export enum RequestResult {
	OK = 0x00,
	Failure = 0x01,
	Forbidden = 0x02,
	NetworkUnreachable = 0x03,
	HostUnreachable = 0x04,
	ConnectionRefused = 0x05,
	ProtocolError = 0x07,
	AdressTypeNotSupported = 0x08,
}
export default class Client  extends EventEmitter implements IProxyClient {
	private stage = InitStage.Greeting;
	private addressType: AddressType;
	private address: string;
	private port: number;
	public constructor(private socket: net.Socket) {
		super();
	}
	public listenForAuth() {
		this.socket.on("data", (chunk: Buffer) => {
			try {
				if (this.stage === InitStage.Greeting) {
					this.greeting(chunk);
				} else if (this.stage === InitStage.Auth) {
					this.auth(chunk);
				} else if (this.stage === InitStage.Command) {
					if (chunk.readUInt8(0) !== 0x05) {
						throw new ProtocolException("unknown protocol");
					}
					if (chunk.readUInt8(1) !== 0x01) {
						throw new ProtocolException("unknown command");
					}
					if (chunk.readUInt8(2) !== 0x00) {
						throw new ProtocolException("cruppted packet");
					}
					switch (chunk.readUInt8(3)) {
						case 0x01: this.addressType = AddressType.IPv4; break;
						case 0x03: this.addressType = AddressType.Domain; break;
						// case 0x04: this.addressType = AddressType.IPv6; break;
						default:
							throw new ProtocolException("unknown address type");
					}
					const rest = chunk.slice(3);
					if (this.addressType === AddressType.IPv4) {
						this.address = `${chunk.readUInt8(4)}.${chunk.readUInt8(5)}.${chunk.readUInt8(6)}.${chunk.readUInt8(7)}`;
						this.port = chunk.readUInt8(8) * 256 + chunk.readUInt8(9);
					} else if (this.addressType === AddressType.Domain) {
						const length = chunk.readUInt8(4);
						this.address = chunk.slice(5, 5 + length).toString("utf8");
						if (this.address.length !== length) {
							throw new ProtocolException("small packet");
						}
						const pos = 5 + length + 1;
						this.port = chunk.readUInt8(pos) * 256 + chunk.readUInt8(pos + 1);
					}
					this.stage = InitStage.ConnectUpstream;
					const cb = (status: RequestResult) => {
						const newBuffer = Buffer.alloc(rest.length + 3);
						newBuffer.writeUInt8(0x05, 0);
						newBuffer.writeUInt8(status, 1);
						newBuffer.writeUInt8(0x00, 2);
						rest.copy(newBuffer, 3);
						this.socket.write(newBuffer);
						if (status !== RequestResult.OK) {
							this.socket.destroy();
						}
					};
					this.emit("request", this.address, this.port, cb);
				}
			} catch (e) {
				if (e instanceof ProtocolException) {

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
	private greeting(buffer: Buffer) {
		if (buffer.readUInt8(0) !== 0x05) {
			throw new ProtocolException("unknown protocol");
		}
		const methodsLength = buffer.readUInt8(1);
		const methods: AuthMethod[] = [];
		for (let x = 0; x < methodsLength; x++) {
			switch (buffer.readUInt8(2 + x)) {
				case 0x00: methods.push(AuthMethod.NoAuth); break;
				case 0x01: methods.push(AuthMethod.GSSAPI); break;
				case 0x02: methods.push(AuthMethod.Password); break;
			}
		}
		this.socket.write(Buffer.from([0x05, 0x02]));
		this.stage = InitStage.Auth;
	}
	private auth(buffer: Buffer) {
		if (buffer.readUInt8(0) !== 0x01) {
			throw new ProtocolException("unknown auth method");
		}
		const usernameLength = buffer.readUInt8(1);
		let slice: Buffer = buffer.slice(2, 2 + usernameLength);
		if (slice.length !== usernameLength) {
			throw new ProtocolException("small packet");
		}
		const username = slice.toString("utf8");
		const passwordLength = buffer.readUInt8(2 + usernameLength);
		slice = buffer.slice(2 + usernameLength + 1, 2 + usernameLength + 1 + passwordLength);
		if (slice.length !== passwordLength) {
			throw new ProtocolException("small packet");
		}
		const password = slice.toString("utf8");
		const cb = (result: boolean) => {
			if (result) {
				this.socket.write(Buffer.from([0x01, 0x00]));
				this.stage = InitStage.Command;
			} else {
				this.socket.write(Buffer.from([0x01, 0x01]), () => {
					this.socket.destroy();
				});
			}
		};
		this.emit("auth", username, password, cb);
	}
}
