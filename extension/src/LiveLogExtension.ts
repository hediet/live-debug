import { liveLogContract } from "@hediet/live-debug";
import { Server } from "./server";
import * as vscode from "vscode";
import { Disposable } from "@hediet/std/disposable";

export class LiveLogExtension {
	readonly dispose = Disposable.fn();
	private readonly logs = new LiveLogs();

	private decorationType = this.dispose.track(
		vscode.window.createTextEditorDecorationType({
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
		})
	);

	constructor(prev?: LiveLogExtension) {
		if (prev) {
			this.logs = prev.logs;
			this.updateAllText();
		}

		this.dispose.track([
			Server.instance.registerClientHandler((typedChannel, onClose) =>
				liveLogContract.registerServer(typedChannel, {
					logExpression: async args => {
						this.logs.updateLiveLog(
							args.filename,
							args.lineNumber,
							{ text: args.value }
						);

						this.updateAllText();
					},
					logExpressionById: async args => {
						this.logs.updateLiveLogById(args.id, {
							text: args.value,
						});

						this.updateAllText();
					},
				})
			),
			vscode.window.onDidChangeVisibleTextEditors(e => {
				this.updateAllText();
			}),
			vscode.workspace.onDidChangeTextDocument(e => {
				this.updateAllText();
			}),
		]);
	}

	private updateAllText() {
		for (const editor of vscode.window.visibleTextEditors) {
			this.updateText(editor);
		}
	}

	private updateText(editor: vscode.TextEditor) {
		const curFilename = editor.document.fileName
			.replace(/\\/g, "/")
			.toLowerCase();

		if (this.logs.getLiveLogsForFile(curFilename).length === 0) {
			editor.setDecorations(this.decorationType, []);
			return;
		}

		const idByLine: { position: vscode.Position; text: string }[] = [];

		const txt = editor.document.getText();
		const re = /(liveLogId\(\"(.*)\",.*\);)|(liveLog\(.*\);)/g;
		let m;
		while ((m = re.exec(txt))) {
			const line = editor.document.positionAt(m.index).line;
			// const position = editor.document.lineAt(line).range.end;
			const position = editor.document.positionAt(
				m.index + m[0].length - 2
			);
			const logEntry = this.logs.getLiveLogForFileAndLine(
				m[2],
				curFilename,
				line
			);
			if (logEntry) {
				// ➜
				idByLine.push({ position, text: `: ${logEntry.text}` });
			}
		}

		editor.setDecorations(
			this.decorationType,
			idByLine.map(o => {
				const hoverMessage = new vscode.MarkdownString();
				hoverMessage.isTrusted = true;
				hoverMessage.appendText(o.text);

				const dec: vscode.DecorationOptions = {
					range: new vscode.Range(o.position, o.position),
					renderOptions: {
						after: {
							contentText: o.text,
							// margin: "10px",
							color: "blue",
						},
					},
					hoverMessage,
				};
				return dec;
			})
		);
	}
}

interface LiveLog {
	text: string;
}

class LiveLogs {
	private readonly liveLogs = new Map<string, Map<number, LiveLog>>();
	private readonly liveLogsById = new Map<string, LiveLog>();

	public getLiveLogsForFile(filename: string): LiveLog[] {
		let m = this.liveLogs.get(filename);
		return (m ? [...m.values()] : []).concat([
			...this.liveLogsById.values(),
		]);
	}

	public getLiveLogForFileAndLine(
		id: string | undefined,
		filename: string,
		line: number
	): LiveLog | undefined {
		if (id) {
			const l = this.liveLogsById.get(id);
			if (l) {
				return l;
			}
		}

		let m = this.liveLogs.get(filename);
		if (!m) {
			return undefined;
		}
		return m.get(line);
	}

	public updateLiveLog(filename: string, line: number, log: LiveLog) {
		let m = this.liveLogs.get(filename);
		if (!m) {
			m = new Map<number, LiveLog>();
			this.liveLogs.set(filename, m);
		}

		m.set(line, log);
	}

	public updateLiveLogById(id: string, log: LiveLog) {
		this.liveLogsById.set(id, log);
	}
}
