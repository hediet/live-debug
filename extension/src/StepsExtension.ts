import { StepsLiveDebugContract } from "@hediet/node-reload";
import { Disposable } from "@hediet/std/disposable";
import * as vscode from "vscode";
import { Server } from "./server";

const packageId = "node-reload-steps-vscode";
const runCmdId = `${packageId}.run`;
type RunCmdIdArgs = { controllerId?: number; stepId: string };

export interface StepState {
	id: string;
	state: "notRun" | "running" | "ran" | "undoing" | "undone";
}

export class StepsExtension implements Disposable {
	public dispose = Disposable.fn();
	private decorationType = this.dispose.track(
		vscode.window.createTextEditorDecorationType({
			after: { margin: "20px" },
		})
	);

	private clients = new Set<{
		state: StepState[];
		client: typeof StepsLiveDebugContract.TClientInterface;
	}>();

	constructor() {
		this.updateDecorationsForAllEditors();

		this.dispose.track([
			Server.instance.registerClientHandler((typedChannel, onClose) =>
				Disposable.fn(track => {
					const { client } = track(
						StepsLiveDebugContract.registerServer(typedChannel, {
							updateState: ({ newState }) => {
								clientState.state = newState;
								this.updateDecorationsForAllEditors();
							},
						})
					);
					const clientState = {
						state: new Array<StepState>(),
						client,
					};
					this.clients.add(clientState);

					typedChannel.onListening.then(() =>
						client.requestUpdate({})
					);

					onClose.then(() => {
						this.clients.delete(clientState);
						this.updateDecorationsForAllEditors();
					});
				})
			),
			vscode.commands.registerCommand(runCmdId, (args: RunCmdIdArgs) => {
				this.runStep(args.stepId, args.controllerId);
			}),
			vscode.window.onDidChangeVisibleTextEditors(e => {
				this.updateDecorationsForAllEditors();
			}),
			vscode.workspace.onDidChangeTextDocument(e => {
				for (const editor of vscode.window.visibleTextEditors) {
					if (editor.document === e.document) {
						this.updateDecorations(editor);
					}
				}
			}),
		]);
	}

	private updateDecorationsForAllEditors() {
		for (const editor of vscode.window.visibleTextEditors) {
			this.updateDecorations(editor);
		}
	}

	private updateDecorations(editor: vscode.TextEditor) {
		const stepStates = new Array<StepState>().concat(
			...[...this.clients].map(c => c.state)
		);

		if (stepStates.length === 0) {
			editor.setDecorations(this.decorationType, []);
			return;
		}

		const idByLine: { id: string; line: number; text: string }[] = [];

		const txt = editor.document.getText();
		const re = /id\: "(.*)"/g;
		let m;
		while ((m = re.exec(txt))) {
			const line = editor.document.positionAt(m.index).line;
			const id = m[1];
			const state = stepStates.find(p => p.id === id);
			if (state) {
				let text: string = "";
				switch (state.state) {
					case "notRun":
						text = "❔ Not run";
						break;
					case "running":
						text = "🏃 Running...";
						break;
					case "ran":
						text = "✔️ Ran";
						break;
					case "undoing":
						text = "◀️ Rewinding...";
						break;
					case "undone":
						text = "⏪ Rewound";
						break;
				}
				idByLine.push({ line, id, text });
			}
		}

		editor.setDecorations(
			this.decorationType,
			idByLine.map(o => {
				const lineEnd = editor.document.lineAt(o.line).range.end;
				const hoverMessage = new vscode.MarkdownString();
				hoverMessage.isTrusted = true;
				const params = encodeURIComponent(
					JSON.stringify({ stepId: o.id } as RunCmdIdArgs)
				);
				hoverMessage.appendMarkdown(
					`* [Run Step '${o.id}'](command:${runCmdId}?${params})`
				);
				const dec: vscode.DecorationOptions = {
					range: new vscode.Range(lineEnd, lineEnd),
					renderOptions: {
						after: {
							contentText: o.text,
						},
					},
					hoverMessage,
				};
				return dec;
			})
		);
	}

	private async runStep(
		stepId: string,
		controllerId?: number
	): Promise<void> {
		for (const c of this.clients) {
			c.client.runToStepIncluding({ stepId });
		}
	}
}
