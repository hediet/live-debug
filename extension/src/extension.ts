import {
	enableHotReload,
	hotRequireExportedFn,
	registerUpdateReconciler,
	getReloadCount,
	hotRequire,
} from "@hediet/node-reload";
import { DisposableComponent } from "@hediet/std/disposable";
import * as vscode from "vscode";
import { Server } from "./server";
import { getLiveDebugApi } from "@hediet/live-debug";
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

	hotRequire<typeof import("./LiveLogExtension")>(
		module,
		"./LiveLogExtension",
		LiveLogExtension => {
			return new LiveLogExtension.LiveLogExtension();
		}
	);

	return {};
}

export class ConnectClientExtension extends DisposableComponent {
	constructor() {
		super();

		if (getReloadCount(module) > 0) {
			this.trackDisposable(
				vscode.window.setStatusBarMessage(
					"Reloads: " + getReloadCount(module)
				)
			);
		}

		this.trackDisposable(
			vscode.debug.onDidChangeActiveDebugSession(e =>
				this.connectClient()
			)
		);

		if (vscode.debug.activeDebugSession) {
			this.connectClient();
		}
	}

	private async connectClient(): Promise<void> {
		const e = vscode.debug.activeDebugSession;
		if (
			e &&
			(e.type === "node" || e.type === "node2" || e.type === "chrome")
		) {
			try {
				const r = await e.customRequest("evaluate", {
					expression: `(${getLiveDebugApi.toString()})().connectTo(${
						Server.instance.port
					});`,
				});
			} catch (e) {
				console.error(e);
			}
		}
	}
}
