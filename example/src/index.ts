import { liveLogId } from "@hediet/live-debug";

window.onmousemove = data => {
	liveLogId("datax", data.x);
	liveLogId("datay", data.y);
};
