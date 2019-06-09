import {
	enableHotReload,
	hotRequireExportedFn,
	registerUpdateReconciler,
	getReloadCount,
	hotRequire,
} from "@hediet/node-reload";
import { Disposable } from "@hediet/std/disposable";
import * as vscode from "vscode";
import { Server } from "./server";
import { getLiveDebugApi } from "@hediet/live-debug";
import { LiveLogExtension } from "./LiveLogExtension";
import { wait } from "@hediet/std/timer";

const debug =
	process.execArgv.filter(v => v.indexOf("--inspect-brk") === 0).length > 0;
if (debug) {
	enableHotReload({ entryModule: module });
}

registerUpdateReconciler(module);

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		hotRequireExportedFn(
			module,
			ConnectClientExtension,
			ConnectClientExtension => new ConnectClientExtension()
		)
	);

	let logExt: LiveLogExtension | undefined;
	hotRequire<typeof import("./LiveLogExtension")>(
		module,
		"./LiveLogExtension",
		LiveLogExtension => {
			return (logExt = new LiveLogExtension.LiveLogExtension(logExt));
		}
	);

	hotRequire<typeof import("./StepsExtension")>(
		module,
		"./StepsExtension",
		StepsExtension => {
			return new StepsExtension.StepsExtension();
		}
	);

	return {};
}

export class ConnectClientExtension {
	readonly dispose = Disposable.fn();

	constructor() {
		if (getReloadCount(module) > 0) {
			this.dispose.track(
				vscode.window.setStatusBarMessage(
					"Reloads: " + getReloadCount(module)
				)
			);
		}

		this.dispose.track(
			vscode.debug.onDidChangeActiveDebugSession(e =>
				this.connectClient()
			)
		);

		if (vscode.debug.activeDebugSession) {
			this.connectClient();
		}
	}

	private async connectClient(): Promise<void> {
		const s = vscode.debug.activeDebugSession;
		if (
			s &&
			(s.type === "extensionHost" ||
				s.type === "node" ||
				s.type === "node2" ||
				s.type === "chrome")
		) {
			try {
				await this.sendDebugRequest(s);
			} catch (e) {
				if (e.message === "not connected to runtime") {
					console.log("Retrying");
					await wait(1000);
					try {
						await this.sendDebugRequest(s);
					} catch (e) {
						console.error(e);
					}
				} else {
					console.error(e);
				}
			}
		}
	}

	private async sendDebugRequest(session: vscode.DebugSession) {
		const apiStr = getLiveDebugApi.toString();
		const r = await session.customRequest("evaluate", {
			expression: `(${apiStr})().connectTo(${Server.instance.port});`,
		});
	}
}
