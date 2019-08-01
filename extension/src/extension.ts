import {
	enableHotReload,
	hotRequireExportedFn,
	registerUpdateReconciler,
	getReloadCount,
} from "@hediet/node-reload";
import { Disposable } from "@hediet/std/disposable";
import * as vscode from "vscode";
import { Server } from "./server";
import { getLiveDebugApi } from "@hediet/live-debug";
import { LiveLogExtension } from "./LiveLogExtension";
import { wait } from "@hediet/std/timer";
import { StepsExtension } from "./StepsExtension";

console.log("env", process.env.NODE_ENV);
if (process.env.NODE_ENV !== "production") {
	enableHotReload({ entryModule: module });
}

registerUpdateReconciler(module);

export { StepsExtension, LiveLogExtension };

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		hotRequireExportedFn(
			module,
			ConnectClientExtension,
			ConnectClientExtension => new ConnectClientExtension()
		)
	);

	let logExt: LiveLogExtension | undefined;
	hotRequireExportedFn(
		module,
		LiveLogExtension,
		LiveLogExtension => (logExt = new LiveLogExtension(logExt))
	);

	hotRequireExportedFn(
		module,
		StepsExtension,
		StepsExtension => new StepsExtension()
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
			let i = 1;
			while (true) {
				// wait first as VS Code immediately stopped debugging otherwise.
				await wait(1000);
				try {
					await this.sendDebugRequest(s);
				} catch (e) {
					if (e.message === "not connected to runtime" && i <= 10) {
						console.error(
							`Cought error 'not connected to runtime', repeat (${i})`
						);
						i++;
						continue;
					}
					console.error(`Error while sending command to debuggee`, e);
				}

				break;
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
