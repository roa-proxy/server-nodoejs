import { getHttpMessage } from "./util";

export default class HttpException extends Error {
	public constructor(public code: number, message?: string) {
		super(message);
		if (message === undefined) {
			this.message = getHttpMessage(code);
		}
	}
}
