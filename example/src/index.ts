import { liveLogId, liveLog } from "@hediet/live-debug";

let i = 0;
setInterval(() => {
	// does not work with webpack default settings
	liveLog("" + i++);
}, 1000);

if (typeof window !== "undefined") {
	window.onmousemove = data => {
		console.log("test");
		liveLogId("datax", data.x);
		liveLogId("datay", data.y);
	};
}
