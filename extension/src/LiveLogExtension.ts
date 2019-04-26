import { DisposableComponent } from "@hediet/std/disposable";
import { liveLogContract } from "@hediet/live-debug";
import { Server } from "./server";
import * as vscode from "vscode";

export class LiveLogExtension extends DisposableComponent {
	private readonly logs = new LiveLogs();

	private decorationType = this.trackDisposable(
		vscode.window.createTextEditorDecorationType({
			after: { margin: "20px" },
		})
	);

	constructor() {
		super();

		this.trackDisposable(
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
			)
		);

		this.trackDisposable(
			vscode.window.onDidChangeVisibleTextEditors(e => {
				this.updateAllText();
			})
		);
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

		const idByLine: { line: number; text: string }[] = [];

		const txt = editor.document.getText();
		const re = /(liveLogId\(\"(.*)\",)|(liveLog\()/g;
		let m;
		while ((m = re.exec(txt))) {
			const line = editor.document.positionAt(m.index).line;
			const logEntry = this.logs.getLiveLogForFileAndLine(
				m[2],
				curFilename,
				line
			);
			if (logEntry) {
				idByLine.push({ line, text: logEntry.text });
			}
		}

		editor.setDecorations(
			this.decorationType,
			idByLine.map(o => {
				const lineEnd = editor.document.lineAt(o.line).range.end;
				const hoverMessage = new vscode.MarkdownString();
				hoverMessage.isTrusted = true;

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