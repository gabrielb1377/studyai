import JSZip from "jszip";
import type { AcademyGeneratedContent, AcademyStudy } from "../types";
import { academyContentFileStem } from "./AcademyContentFormatter";

const EMU = 914_400;
const COLORS = { navy: "142947", blue: "2E5CB0", pale: "EDF3FC", text: "1F2937", muted: "667085", white: "FFFFFF" };

type SlideText = { text: string; x: number; y: number; w: number; h: number; size: number; color?: string; bold?: boolean; font?: string; fill?: string };
type SlideDefinition = { background: string; texts: SlideText[] };

function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function plain(value: string) {
  return value.replace(/```[\s\S]*?```/g, "").replace(/!\[[^\]]*]\([^)]*\)/g, "").replace(/\[([^\]]+)]\([^)]*\)/g, "$1").replace(/[*_~`>#]/g, "").replace(/\s+/g, " ").trim();
}

function bounded(value: string, maximum = 700) {
  const normalized = plain(value);
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 3).trimEnd()}...` : normalized;
}

function mermaidSource(content: AcademyGeneratedContent) {
  for (const chapter of content.chapters) {
    const match = chapter.content.match(/```mermaid\s*\n([\s\S]*?)```/i);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return ["graph TD", ...content.concepts.slice(0, 6).map((concept, index) => `  A[${content.title}] --> C${index + 1}[${concept.name}]`)].join("\n");
}

function textBox(item: SlideText, id: number) {
  const paragraphs = item.text.split("\n").map((paragraph) => `<a:p><a:r><a:rPr lang="pt-BR" sz="${Math.round(item.size * 100)}"${item.bold ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${item.color ?? COLORS.text}"/></a:solidFill><a:latin typeface="${xml(item.font ?? "Aptos")}"/></a:rPr><a:t>${xml(paragraph || " ")}</a:t></a:r><a:endParaRPr lang="pt-BR" sz="${Math.round(item.size * 100)}"/></a:p>`).join("");
  const fill = item.fill ? `<a:solidFill><a:srgbClr val="${item.fill}"/></a:solidFill>` : "<a:noFill/>";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(item.x * EMU)}" y="${Math.round(item.y * EMU)}"/><a:ext cx="${Math.round(item.w * EMU)}" cy="${Math.round(item.h * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="t" lIns="91440" rIns="91440" tIns="45720" bIns="45720"><a:spAutoFit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

function slideXml(slide: SlideDefinition) {
  const shapes = slide.texts.map((item, index) => textBox(item, index + 2)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${slide.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function bodySlide(title: string, lines: string[], options: { fontSize?: number; code?: boolean } = {}): SlideDefinition {
  return { background: COLORS.white, texts: [
    { text: title, x: 0.7, y: 0.42, w: 11.9, h: 0.62, size: 27, bold: true, color: COLORS.navy, font: "Aptos Display" },
    { text: lines.join("\n"), x: 0.85, y: 1.35, w: 11.65, h: 5.55, size: options.fontSize ?? 20, color: COLORS.text, font: options.code ? "Courier New" : "Aptos", fill: options.code ? COLORS.pale : undefined },
    { text: "StudyAI Academy", x: 0.7, y: 7.05, w: 2.5, h: 0.18, size: 8, color: COLORS.muted },
  ] };
}

function presentationXml(slideCount: number) {
  const ids = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

function contentTypes(slideCount: number) {
  const slides = Array.from({ length: slideCount }, (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${slides}</Types>`;
}

function buildSlides(study: AcademyStudy, content: AcademyGeneratedContent): SlideDefinition[] {
  const slides: SlideDefinition[] = [{ background: COLORS.navy, texts: [
    { text: "STUDYAI ACADEMY", x: 0.85, y: 0.8, w: 4, h: 0.35, size: 11, bold: true, color: "91B7F7" },
    { text: content.title, x: 0.85, y: 1.55, w: 10.9, h: 2.3, size: 38, bold: true, color: COLORS.white, font: "Aptos Display" },
    { text: `${study.subject}\n${study.topic}`, x: 0.85, y: 5.7, w: 7, h: 0.75, size: 17, color: "D6E1F2" },
  ] }];
  slides.push(bodySlide("Objetivos", [bounded(content.objective, 500), "", "Pré-requisitos", ...content.prerequisites.map((item) => `- ${bounded(item, 140)}`)], { fontSize: 21 }));
  slides.push(bodySlide("Conceitos principais", content.concepts.slice(0, 9).map((concept) => `${concept.name}: ${bounded(concept.description, 150)}`), { fontSize: 18 }));
  content.chapters.forEach((chapter, index) => slides.push(bodySlide(`${index + 1}. ${chapter.title}`, [bounded(chapter.objective, 180), "", bounded(chapter.content, 1_000), "", ...chapter.examples.slice(0, 3).map((example) => `Exemplo: ${bounded(example, 150)}`)], { fontSize: 17 })));
  slides.push(bodySlide("Exemplos", (content.examples.length ? content.examples : content.chapters.flatMap((chapter) => chapter.examples)).slice(0, 9).map((item) => `- ${bounded(item, 170)}`), { fontSize: 18 }));
  slides.push(bodySlide("Diagrama", ["Fonte Mermaid editável", "", mermaidSource(content)], { fontSize: 16, code: true }));
  slides.push(bodySlide("Exercícios", content.exercises.slice(0, 8).map((exercise, index) => `${index + 1}. ${bounded(exercise.question, 180)}`), { fontSize: 18 }));
  slides.push(bodySlide("Resumo", [bounded(content.summary, 1_300), "", ...content.review.slice(0, 4).map((item) => `Revisão: ${bounded(item, 140)}`)], { fontSize: 20 }));
  slides.push(bodySlide("Próximos passos", (content.nextSteps.length ? content.nextSteps : content.studyPlan).slice(0, 9).map((item) => `- ${bounded(item, 170)}`), { fontSize: 20 }));
  return slides;
}

export const PresentationContentGenerator = {
  async generate(study: AcademyStudy, content: AcademyGeneratedContent) {
    const slides = buildSlides(study, content);
    const zip = new JSZip();
    zip.file("[Content_Types].xml", contentTypes(slides.length));
    zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    zip.folder("docProps")?.file("core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(content.title)}</dc:title><dc:subject>${xml(study.subject)}</dc:subject><dc:creator>StudyAI</dc:creator><cp:lastModifiedBy>StudyAI</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
    zip.folder("docProps")?.file("app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>StudyAI</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slides.length}</Slides><Company>StudyAI</Company></Properties>`);
    zip.folder("ppt")?.file("presentation.xml", presentationXml(slides.length));
    const presentationRels = [`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`, ...slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`)].join("");
    zip.folder("ppt/_rels")?.file("presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presentationRels}</Relationships>`);
    slides.forEach((slide, index) => {
      zip.folder("ppt/slides")?.file(`slide${index + 1}.xml`, slideXml(slide));
      zip.folder("ppt/slides/_rels")?.file(`slide${index + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
    });
    zip.folder("ppt/slideMasters")?.file("slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
    zip.folder("ppt/slideMasters/_rels")?.file("slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
    zip.folder("ppt/slideLayouts")?.file("slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
    zip.folder("ppt/slideLayouts/_rels")?.file("slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
    zip.folder("ppt/theme")?.file("theme1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="StudyAI"><a:themeElements><a:clrScheme name="StudyAI"><a:dk1><a:srgbClr val="142947"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="EDF3FC"/></a:lt2><a:accent1><a:srgbClr val="2E5CB0"/></a:accent1><a:accent2><a:srgbClr val="5B7FC1"/></a:accent2><a:accent3><a:srgbClr val="6B8E6B"/></a:accent3><a:accent4><a:srgbClr val="A06A4B"/></a:accent4><a:accent5><a:srgbClr val="7B6AA8"/></a:accent5><a:accent6><a:srgbClr val="4C8A91"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="StudyAI"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="StudyAI"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", compression: "DEFLATE" });
    return { blob, fileName: `${academyContentFileStem(content.title)}-apresentacao.pptx`, slideCount: slides.length };
  },
};
