
export interface IHttpBasicAuthorization {
	username: string;
	password: string;
}
export interface IHttpRequestHeader {
	method: string;
	uri: string;
	protocol: string;
	[key: string]: string;
}
export interface IHttpResponseHeader {
	protocol: string;
	code: string;
	message: string;
	[key: string]: string;
}

export function getHttpMessage(code: number) {
	switch (code) {
		case(100): return "Continue";
		case(101): return "Switching Protocols";
		case(102): return "Processing";

		case(200): return "OK";
		case(201): return "Created";
		case(202): return "Accepted";
		case(203): return "Non-Authoritative Information";
		case(204): return "No Content";
		case(205): return "Reset Content";
		case(206): return "Partial Content";
		case(207): return "Multi-Status";
		case(208): return "Already Reported";
		case(226): return "IM Used";

		case(300): return "Multiple Choices";
		case(301): return "Moved Permanently";
		case(302): return "Found";
		case(303): return "See Other";
		case(304): return "Not Modified";
		case(305): return "Use Proxy";
		case(306): return "Switch Proxy";
		case(307): return "Temporary Redirect";
		case(308): return "Permanent Redirect";

		case(400): return "Bad Request";
		case(401): return "Unauthorized";
		case(402): return "Payment Required";
		case(403): return "Forbidden";
		case(404): return "Not Found";
		case(405): return "Method Not Allowed";
		case(406): return "Not Acceptable";
		case(407): return "Proxy Authentication Required";
		case(408): return "Request Timeout";
		case(409): return "Conflict";
		case(410): return "Gone";
		case(411): return "Length Required";
		case(412): return "Precondition Failed";
		case(413): return "Payload Too Large";
		case(414): return "URI Too Long";
		case(415): return "Unsupported Media Type";
		case(416): return "Range Not Satisfiable";
		case(417): return "Expectation Failed";
		case(418): return "I'm a teapot";
		case(421): return "Misdirected Request";
		case(422): return "Unprocessable Entity";
		case(423): return "Locked";
		case(424): return "Failed Dependency";
		case(426): return "Upgrade Required";
		case(428): return "Precondition Required";
		case(429): return "Too Many Requests";
		case(431): return "Request Header Fields Too Large";
		case(451): return "Unavailable For Legal Reasons";

		case(500): return "Internal Server Error";
		case(501): return "Not Implemented";
		case(502): return "Bad Gateway";
		case(503): return "Service Unavailable";
		case(504): return "Gateway Timeout";
		case(505): return "HTTP Version Not Supported";
		case(506): return "Variant Also Negotiates";
		case(507): return "Insufficient Storage";
		case(508): return "Loop Detected";
		case(510): return "Not Extended";
		case(511): return "Network Authentication Required";
	}
}
export function parseHttpRequestLines(raw: string): IHttpRequestHeader {
	const endOfFirstLine = raw.indexOf("\r\n");
	if (endOfFirstLine === -1) {
		return;
	}
	const firstLine = raw.substr(0, endOfFirstLine);
	const parts = firstLine.match(/^([\S]+)\s+([\S]+)\s+([\S]+)$/i);
	if (!parts || !parts.length) {
		return;
	}
	const method = parts[1].toLocaleUpperCase();
	const lines = parseHttpLines(raw.substr(endOfFirstLine + 2));
	return Object.assign({}, lines, {method, uri: parts[2], protocol: parts[3]});
}
export function parseHttpResponseLines(raw: string): IHttpResponseHeader {
	const endOfFirstLine = raw.indexOf("\r\n");
	if (endOfFirstLine === -1) {
		return;
	}
	const firstLine = raw.substr(0, endOfFirstLine);
	const parts = firstLine.match(/^([\S]+)\s+([\S]+)\s+(.+)$/i);
	if (!parts || !parts.length) {
		return;
	}
	const lines = parseHttpLines(raw.substr(endOfFirstLine + 2));
	return Object.assign({}, lines, {protocol: parts[1], code: parts[2], message: parts[3]});
}
export function parseHttpLines(raw: string) {
	const lines = raw.split("\r\n");
	const headers: {[key: string]: string} = {};
	for (const line of lines) {
		const parts = line.split(":", 2);
		const name = parts[0].toLowerCase().trim();
		if (!name.length) {
			continue;
		}
		headers[name] = parts.length === 2 ? parts[1].trim() : undefined;
	}
	return headers;
}
export function parseAuthHttpHeader(raw: string): IHttpBasicAuthorization {
	const parts = raw.trim().split(" ", 2);
	if (parts.length !== 2) {
		return;
	}
	const type = parts[0].toLowerCase();
	if (type !== "basic") {
		return;
	}
	const userpass = Buffer.from(parts[1], "base64").toString("utf8").split(":", 2);
	if (userpass.length !== 2) {
		return;
	}
	return {
		username: userpass[0],
		password: userpass[1],
	};
}
export function parseCookieHttpHeader(raw: string) {
	const result: {[key: string]: string} = {};
	const items = raw.trim().split(";");
	for (const item of items) {
		const parts = item.split("=", 2);
		if (parts.length !== 2) {
			continue;
		}
		result[parts[0]] = parts[1];
	}
	return result;
}
