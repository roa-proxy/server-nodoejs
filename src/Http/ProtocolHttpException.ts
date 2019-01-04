export default class ProtocolHttpException extends Error {
	public constructor(public response: string | Buffer, message?: string) {
		super(message);
	}
}
