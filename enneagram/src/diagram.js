const point = (type, radius, cx = 180, cy = 180) => {
  const angle = (((type % 9) * 40 - 90) * Math.PI) / 180;
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
};
const coords = (p) => p.map((v) => v.toFixed(2)).join(",");
export function diagram(
  scores = [64, 80, 53, 78, 94, 60, 50, 42, 71],
  primary = null,
  color = "#738666",
  id = "map",
) {
  const types = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const polygon = types
    .map((t) => coords(point(t, 126 * (scores[t - 1] / 100))))
    .join(" ");
  const edge = (seq) => seq.map((t) => coords(point(t, 126))).join(" ");
  return `<svg viewBox="0 0 360 360" class="diagram" role="img" aria-labelledby="${id}-title"><title id="${id}-title">아홉 유형의 마음 지도${primary ? `, ${primary}번 유형 점수가 가장 높음` : ""}</title>
    ${[0.25, 0.5, 0.75, 1].map((r) => `<polygon points="${types.map((t) => coords(point(t, 126 * r))).join(" ")}" fill="none" stroke="#dadbd1" stroke-width="1"/>`).join("")}
    ${types.map((t) => `<line x1="180" y1="180" x2="${point(t, 126)[0]}" y2="${point(t, 126)[1]}" stroke="#dedfd7" stroke-width=".7"/>`).join("")}
    <polyline points="${edge([9, 3, 6, 9])}" fill="none" stroke="#bac4b3" stroke-width="1" opacity=".6"/><polyline points="${edge([1, 4, 2, 8, 5, 7, 1])}" fill="none" stroke="#bac4b3" stroke-width="1" opacity=".6"/>
    <polygon points="${polygon}" fill="${color}" fill-opacity=".18" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
    ${types
      .map((t) => {
        const p = point(t, (126 * scores[t - 1]) / 100),
          l = point(t, 153);
        return `<circle cx="${p[0]}" cy="${p[1]}" r="${primary === t ? 5 : 3}" fill="${color}"/><text x="${l[0]}" y="${l[1] + 5}" text-anchor="middle" fill="${primary === t ? color : "#83877c"}" font-family="sans-serif" font-size="16" font-weight="${primary === t ? 700 : 400}">${t}</text>`;
      })
      .join("")}
    <circle cx="180" cy="180" r="3" fill="${color}"/></svg>`;
}
export async function downloadCard(result, type, title) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1500;
  const c = canvas.getContext("2d");
  c.fillStyle = "#f6f3ec";
  c.fillRect(0, 0, 1200, 1500);
  c.fillStyle = "#52664c";
  c.font = "24px sans-serif";
  c.fillText("마음지도  /  ENNEAGRAM ATLAS", 80, 110);
  c.fillStyle = "#292f25";
  c.font = "bold 66px sans-serif";
  c.fillText(title, 80, 225);
  c.font = "28px sans-serif";
  c.fillStyle = "#73796d";
  c.fillText(type?.tagline || "여러 가능성을 품은 나의 마음", 80, 288);
  const markup = diagram(
    result.scores,
    result.primary,
    type?.color,
    "export",
  ).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  const blob = new Blob([markup], { type: "image/svg+xml" }),
    url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    c.drawImage(img, 160, 350, 880, 880);
  } finally {
    URL.revokeObjectURL(url);
  }
  c.fillStyle = "#73796d";
  c.font = "24px sans-serif";
  c.fillText("지금의 나를 돌아보는 지도. 정답이나 진단이 아닙니다.", 80, 1360);
  c.font = "22px sans-serif";
  c.fillText(
    `${location.hostname}  ·  ${new Date().toLocaleDateString("ko-KR")}`,
    80,
    1410,
  );
  const png = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(png);
  link.download = "나의-마음지도.png";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
