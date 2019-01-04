import { EventEmitter } from "events";

export default interface IProxyClient extends EventEmitter {
	on(event: "auth", listener: (username: string, password: string, cb: (result: boolean) => void) => void): this;
	// tslint:disable-next-line:ban-types
	on(event: "request", listener: (address: string, port: number, cb: Function) => void): this;
}
