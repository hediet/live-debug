# Live Debug

[![](https://img.shields.io/twitter/follow/hediet_dev.svg?style=social)](https://twitter.com/intent/follow?screen_name=hediet_dev)

This is the VSCode extension for `@hediet/live-debug`, `@hediet/node-reload`
and other libraries that implement live debug.

## Live Logging

Just use `liveLog(expression)` from `@hediet/live-debug`
and it shows you the last value of the expression inline:

![Demo](./docs/demo-live-log.gif)

Works for both NodeJS and web applications.

## Steps Execution State Visualizer

It displays the current executation state when **simply debugging**
a nodejs application that uses the step execution controller
(see `runExportedSteps` in `@hediet/node-reload`).

### Example

If you have this typescript code:

```ts
enableHotReload();
registerUpdateReconciler(module);
runExportedSteps(module, getSteps);

export function getSteps(): Steps {
	return steps(
		{
			id: "start",
			run: async (args, { onRewind }) => {
				await slowLog("start");
				onRewind(() => slowLog("undo start"));
				return { data: 9 };
			},
		},
		{
			id: "continue1",
			run: async (args, { onRewind }) => {
				await slowLog("continue 1");
				onRewind(() => slowLog("undo 1"));
				return { data2: 10, ...args };
			},
		},
		{
			id: "continue2",
			run: async (args, { onRewind }) => {
				await slowLog("continue 2");
				onRewind(() => slowLog("undo 2"));
				return {};
			},
		}
	);
}
```

And debug it using vscode and having this extension installed, you can see the executation state of each step:

![Execution state](./docs/demo-vscode-steps1.gif)

You can also run a specific step:

![Move to step](./docs/demo-vscode-steps2.gif)

It integrates very well with puppeteer:

![Puppeteer Demo](./docs/demo-puppeteer.gif)

## How does it work

When debugging a node application using the `node`, `node2` or `chrome` debug adapter,
this extension launches an RPC server and
instructs the `live-debug` library instance of the debugee to connect to it.

## ChangeLog

-   0.5.0 Version Upgrade
