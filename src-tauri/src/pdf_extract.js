// Fixed PDFKit script. Run as: osascript -l JavaScript - <path to pdf>
// Prints one JSON object on stdout: {"state": "...", "pages": N, "text": [...]}.
ObjC.import("Foundation");
ObjC.import("PDFKit");

function run(argv) {
  try {
    var path = argv && argv.length ? String(argv[0]) : "";
    if (!path) return JSON.stringify({ state: "unreadable" });
    var doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(path));
    var count = Number(doc.pageCount);
    if (!isFinite(count) || count < 1) return JSON.stringify({ state: "unreadable" });
    if (doc.isLocked) return JSON.stringify({ state: "locked" });
    var text = [];
    for (var i = 0; i < count; i++) {
      var s = "";
      try { s = ObjC.unwrap(doc.pageAtIndex(i).string) || ""; } catch (e) { s = ""; }
      text.push(typeof s === "string" ? s : "");
    }
    return JSON.stringify({ state: "ok", pages: count, text: text });
  } catch (e) {
    return JSON.stringify({ state: "unreadable" });
  }
}
