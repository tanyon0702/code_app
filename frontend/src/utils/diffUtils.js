function splitLines(value) {
  return value.replace(/\r\n/g, "\n").split("\n");
}

function countEdgeMatches(beforeLines, afterLines) {
  let start = 0;
  while (
    start < beforeLines.length &&
    start < afterLines.length &&
    beforeLines[start] === afterLines[start]
  ) {
    start += 1;
  }

  let end = 0;
  while (
    end < beforeLines.length - start &&
    end < afterLines.length - start &&
    beforeLines[beforeLines.length - 1 - end] === afterLines[afterLines.length - 1 - end]
  ) {
    end += 1;
  }

  return { start, end };
}

export function buildLineDiff(beforeText, afterText) {
  const beforeLines = splitLines(beforeText);
  const afterLines = splitLines(afterText);
  const { start, end } = countEdgeMatches(beforeLines, afterLines);

  const beforeMiddle = beforeLines.slice(start, beforeLines.length - end);
  const afterMiddle = afterLines.slice(start, afterLines.length - end);
  const contextTop = beforeLines.slice(Math.max(0, start - 2), start);
  const contextBottom = beforeLines.slice(beforeLines.length - end, beforeLines.length - end + 2);

  const lines = [];

  for (const line of contextTop) {
    lines.push({ type: "context", text: line });
  }

  for (const line of beforeMiddle) {
    lines.push({ type: "removed", text: line });
  }

  for (const line of afterMiddle) {
    lines.push({ type: "added", text: line });
  }

  for (const line of contextBottom) {
    lines.push({ type: "context", text: line });
  }

  return {
    changed: beforeText !== afterText,
    beforeLineCount: beforeLines.length,
    afterLineCount: afterLines.length,
    lines,
  };
}

export function buildProjectFixDiffs(currentFiles, nextFiles) {
  return nextFiles.map((candidate) => {
    const current = currentFiles.find((file) => file.path === candidate.filename);
    const beforeText = current?.content ?? "";
    const afterText = candidate.content ?? "";

    return {
      filename: candidate.filename,
      diff: buildLineDiff(beforeText, afterText),
    };
  });
}
