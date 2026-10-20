// Monta os cards de Trabalhos a partir de midia/, copia a mídia para assets/ e gera portfolio.pdf.
// Uso: node gerar.mjs   (rode de novo sempre que mudar algo em midia/ ou no index.html)
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const MIDIA = path.join(RAIZ, "midia");
const ASSETS = path.join(RAIZ, "assets");
const INDEX = path.join(RAIZ, "index.html");
const PDF = path.join(RAIZ, "portfolio.pdf");
const LIMITE_MB = 15;

const VIDEO = new Set([".mp4", ".mov"]);
const IMAGEM = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// Ordem e textos dos clientes. O nome da subpasta é casado pelas chaves.
// insta: @ do Instagram (sem o @). Quando existe, o título do card vira o @ com link; sem ele, fica o nome.
const CLIENTES = [
  { insta: "remax.showlajedo", chaves: ["remax"], nome: "RE/MAX Show", segmento: "Imobiliária · Lajedo",
    fiz: "Roteiros de locação, venda, financiamento, recrutamento de corretores e lançamento de loteamentos. Vídeos de imóveis, com cenas de apoio feitas com IA, e animação do logotipo." },
  { insta: "ipeocaruaru", chaves: ["ipeo"], nome: "IPEO Caruaru", segmento: "Cursos e especializações em odontologia · Caruaru",
    fiz: "[descrever trabalho]" },
  { insta: "xangailajedo", chaves: ["xangai"], nome: "Restaurante Xangai", segmento: "Culinária japonesa e chinesa · Lajedo",
    fiz: "Conteúdo de delivery e de produto, com legendas e imagens de apoio." },
  { insta: "lau_iphones", chaves: ["laudoiphone", "lauiphone", "lau"], nome: "Lau iPhones", segmento: "Loja de iPhones · Lajedo",
    fiz: "Roteiros e vídeos publicitários, incluindo uma campanha de sorteio em parceria." },
  { insta: "duefratelligaranhuns", chaves: ["duefratelli", "fratelli"], nome: "Due Fratelli", segmento: "Pizzaria e restaurante italiano · Garanhuns e Caruaru",
    fiz: "Vídeos de promoção do delivery e da experiência no restaurante." },
  { insta: "wahotelcaruaru", chaves: ["wahotel"], nome: "WA Hotel Caruaru", segmento: "Hotel · Caruaru",
    fiz: "Vídeo do café da manhã regional, com a tapioca feita na hora." },
  { insta: "fortplast.caruaru", chaves: ["fortplast"], nome: "Fortplast", segmento: "Lonas e produtos para vaquejada · Caruaru",
    fiz: "[descrever trabalho]" },
  { insta: "usedomroyale", chaves: ["domroyale", "royale"], nome: "Dom Royale", segmento: "Moda no atacado",
    fiz: "Textos animados com estética editorial." },
  { chaves: ["smugs"], nome: "Smugs", segmento: "Moda feminina plus size no atacado · Caruaru e Moda Center",
    fiz: "Roteiros e vídeos publicitários verticais." },
  { chaves: ["teixeira"], nome: "Comercial Teixeira", segmento: "Bombas d'água e equipamentos",
    fiz: "Edição de vídeos de vendedor com legendas e letterings de oferta." },
  { chaves: ["boliche"], nome: "Garanhuns Boliche Club", segmento: "Boliche · Garanhuns",
    fiz: "Motion graphics, animação do logotipo e peças de preço." },
  { chaves: ["blastfit"], nome: "Blastfit", segmento: "Moda fitness",
    fiz: "Vídeos em identidade própria: fundo escuro, verde neon e moldura dupla, com cenas criadas com apoio de IA." },
];

const normaliza = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const desatualizado = (destino, origem) => !fs.existsSync(destino) || fs.statSync(destino).mtimeMs < fs.statSync(origem).mtimeMs;
const ffmpeg = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

function codec(arquivo) {
  try {
    return execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name",
      "-of", "csv=p=0", arquivo]).toString().trim();
  } catch { return ""; }
}

// Copia o vídeo; comprime (H.264 1080x1920 CRF 26) se passar do limite, se for .mov ou se não for H.264.
function prepararVideo(origem, pastaDestino) {
  const base = slug(path.parse(origem).name);
  const destino = path.join(pastaDestino, base + ".mp4");
  const poster = path.join(pastaDestino, base + ".jpg");
  const mb = fs.statSync(origem).size / 1024 / 1024;
  const ext = path.extname(origem).toLowerCase();
  const comprimir = mb > LIMITE_MB || ext === ".mov" || codec(origem) !== "h264";

  if (desatualizado(destino, origem)) {
    if (comprimir) {
      console.log(`  comprimindo ${path.basename(origem)} (${mb.toFixed(1)} MB)`);
      ffmpeg(["-i", origem,
        "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1",
        "-c:v", "libx264", "-preset", "medium", "-crf", "26", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", destino]);
    } else {
      console.log(`  copiando ${path.basename(origem)} (${mb.toFixed(1)} MB)`);
      fs.copyFileSync(origem, destino);
    }
  }
  if (desatualizado(poster, destino)) {
    try { ffmpeg(["-ss", "1", "-i", destino, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", poster]); }
    catch { ffmpeg(["-i", destino, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", poster]); }
  }
  return { tipo: "video", src: rel(destino), poster: rel(poster) };
}

function prepararImagem(origem, pastaDestino) {
  const p = path.parse(origem);
  const destino = path.join(pastaDestino, slug(p.name) + p.ext.toLowerCase());
  if (desatualizado(destino, origem)) fs.copyFileSync(origem, destino);
  return { tipo: "imagem", src: rel(destino) };
}

const rel = (abs) => path.relative(RAIZ, abs).split(path.sep).join("/");

function moldura(m, nome) {
  if (m.tipo === "video") {
    return `<div class="frame"><video src="${m.src}" poster="${m.poster}" autoplay muted loop playsinline preload="metadata" aria-label="Vídeo para ${esc(nome)}"></video><img class="poster-print" src="${m.poster}" alt=""></div>`;
  }
  return `<div class="frame"><img src="${m.src}" alt="Trabalho para ${esc(nome)}" loading="lazy"></div>`;
}

// 1. Clientes = subpastas de midia/
fs.mkdirSync(ASSETS, { recursive: true });
const pastas = fs.readdirSync(MIDIA, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const cards = [];
for (const pasta of pastas) {
  const n = normaliza(pasta);
  const idx = CLIENTES.findIndex((c) => c.chaves.some((k) => n.includes(k)));
  const info = idx >= 0 ? CLIENTES[idx] : { nome: pasta, segmento: "[segmento]", fiz: "[descrever trabalho]" };
  console.log(`${pasta} -> ${info.nome}`);

  const destino = path.join(ASSETS, slug(pasta));
  const arquivos = fs.readdirSync(path.join(MIDIA, pasta)).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const midias = [];
  for (const arq of arquivos) {
    const ext = path.extname(arq).toLowerCase();
    if (!VIDEO.has(ext) && !IMAGEM.has(ext)) continue;
    fs.mkdirSync(destino, { recursive: true });
    const origem = path.join(MIDIA, pasta, arq);
    midias.push(VIDEO.has(ext) ? prepararVideo(origem, destino) : prepararImagem(origem, destino));
  }
  cards.push({ ordem: idx >= 0 ? idx : CLIENTES.length + cards.length, info, midias });
}
// Clientes com mídia primeiro, depois os que ainda estão sem arquivos
cards.sort((a, b) => (!a.midias.length - !b.midias.length) || a.ordem - b.ordem);

const htmlCards = cards.map(({ info, midias }, i) => {
  const molduras = midias.length
    ? midias.map((m) => moldura(m, info.nome)).join("\n            ")
    : `<div class="frame frame-empty"><span>mídia em breve</span></div>`;
  return `        <article class="work reveal">
          <div class="work-info">
            <span class="work-num">${String(i + 1).padStart(2, "0")}</span>
            <h3>${info.insta ? `<a href="https://instagram.com/${esc(info.insta)}" target="_blank" rel="noopener" aria-label="Instagram de ${esc(info.nome)}">@${esc(info.insta)}</a>` : esc(info.nome)}</h3>
            <p class="work-seg">${esc(info.segmento)}</p>
            <p class="work-label">O que eu fiz</p>
            <p class="work-desc">${esc(info.fiz)}</p>
          </div>
          <div class="work-media">
            ${molduras}
          </div>
        </article>`;
}).join("\n");

// 2. Foto da capa
const fotoOrigem = path.join(MIDIA, "foto.jpg");
let htmlFoto = `          <div class="photo"></div>`;
if (fs.existsSync(fotoOrigem)) {
  fs.copyFileSync(fotoOrigem, path.join(ASSETS, "foto.jpg"));
  htmlFoto = `          <div class="photo"><img src="assets/foto.jpg" alt="Tailan"></div>`;
}

// 3. Escreve no index.html só entre os marcadores (o resto que você editar fica intacto)
const troca = (html, nome, conteudo) => {
  const re = new RegExp(`(<!-- ${nome}:INICIO -->)[\\s\\S]*?(<!-- ${nome}:FIM -->)`);
  if (!re.test(html)) throw new Error(`marcador ${nome} não encontrado no index.html`);
  return html.replace(re, `$1\n${conteudo}\n$2`);
};
let html = fs.readFileSync(INDEX, "utf8");
html = troca(html, "TRABALHOS", htmlCards);
html = troca(html, "FOTO", htmlFoto);
fs.writeFileSync(INDEX, html);
console.log(`index.html: ${cards.length} clientes`);

// 4. PDF A4
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(INDEX).href, { waitUntil: "networkidle" });
await page.emulateMedia({ media: "print" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: PDF, format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`portfolio.pdf gerado`);
