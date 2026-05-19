"use client";

import html2canvas from "html2canvas";

export function safeFileName(name: string, prefix: string) {
  return `${prefix}_${name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${Date.now()}`;
}

async function elementToImageFile(element: HTMLElement, fileName: string) {
  const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Failed to create image.")), "image/jpeg", 0.92);
  });
  return new File([blob], `${fileName}.jpg`, { type: "image/jpeg" });
}

export async function downloadElementImage(element: HTMLElement, fileName: string) {
  const file = await elementToImageFile(element, fileName);
  const link = document.createElement("a");
  link.download = file.name;
  link.href = URL.createObjectURL(file);
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function shareElementImage(element: HTMLElement, fileName: string, title = "ClientTracking Report") {
  const file = await elementToImageFile(element, fileName);
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }

  const link = document.createElement("a");
  link.download = file.name;
  link.href = URL.createObjectURL(file);
  link.click();
  URL.revokeObjectURL(link.href);
}

export function downloadUrl(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.target = "_blank";
  link.click();
}
