import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import cloudscraper from "cloudscraper";
import { chromium } from "playwright";

const app = express();
const PORT = 3000;

// Serve static files from the public directory
app.use(express.static("public"));

// ================= SEARCH =================

app.get("/search", async (req, res) => {

    try {

        const query = req.query.q;

        const response = await axios.get(
            "https://vegamoviez.com.in/?s=" + encodeURIComponent(query),
            {
                headers: {
                    "User-Agent": "Mozilla/5.0"
                }
            }
        );

        const $ = cheerio.load(response.data);

        const movies = [];

        $("article.post-item").each((i, el) => {

            const title = $(el).find("h3.entry-title a").text().trim();

            // Skip adult posts
            if (title.includes("[18+]")) return;

            const img = $(el).find("img");

            const image =
                img.attr("data-src") ||
                img.attr("src") ||
                img.attr("data-lazy-src") ||
                img.attr("data-original") ||
                "";

            movies.push({
                title,
                url: $(el).find("h3.entry-title a").attr("href"),
                image,
                date: $(el).find("time").text().trim()
            });

        });

        res.json(movies);

    } catch (err) {

        console.log(err);

        res.status(500).json({
            error: "Failed to scrape."
        });

    }

});

// ================= IMAGE PROXY =================

app.get("/image", async (req, res) => {

    try {

        const { url } = req.query;

        const response = await axios.get(url, {
            responseType: "stream",
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://vegamoviez.com.in/"
            }
        });

        res.setHeader(
            "Content-Type",
            response.headers["content-type"] || "image/webp"
        );

        response.data.pipe(res);

    } catch (err) {

        console.log(err.message);

        res.status(404).send("Image not found");

    }

});

// ================= Movie =================

app.get("/movie", async (req, res) => {
    try {
        const url = decodeURIComponent(req.query.url);

        if (!url) {
            return res.status(400).json({ error: "Missing url" });
        }

        const response = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0"
            }
        });

        const $ = cheerio.load(response.data);

        const title = $("h1.entry-title").text().trim();

        const downloads = [];

        const downloadDivs = $("div.downloads-btns-div").toArray();

        for (const div of downloadDivs) {

            // Quality is usually the previous <p>
            const quality = $(div).prev("p").text().trim();

            const btnElements = $(div).find("a.btn").toArray();

            for (const a of btnElements) {

                const href = $(a).attr("href") || "";

                let finalUrl = href;

                try {
                    const parsed = new URL(href);

                    if (parsed.pathname === "/go" && parsed.searchParams.has("url")) {
                        finalUrl = parsed.searchParams.get("url");
                    }
                } catch (e) {
                    // Ignore invalid URLs
                }

                let extractedLinks = [];

                try {

                    // If it's a HubCloud drive link
                    if (finalUrl.includes("hubcloud.cx/drive/")) {

                        // Step 1: Open HubCloud page
                        const hubPage = await axios.get(finalUrl, {
                            headers: {
                                "User-Agent": "Mozilla/5.0"
                            }
                        });

                        const $$ = cheerio.load(hubPage.data);

                        const gamerUrl = $$("#download").attr("href");

                        if (gamerUrl) {

                            // Step 2: Open GamerXYT page
                            const gamerPage = await axios.get(gamerUrl, {
                                headers: {
                                    "User-Agent": "Mozilla/5.0",
                                    Referer: finalUrl
                                }
                            });

                            const $$$ = cheerio.load(gamerPage.data);

                            const pxlMatch = gamerPage.data.match(/var\s+pxl\s*=\s*["'](https:\/\/pixeldrain\.dev[^"']+)["']/i);
                            const overridePxl = pxlMatch ? pxlMatch[1] : null;

                            const rawLinks = [];

                            $$$("a[href]").each((_, el) => {

                                let href = $$$(el).attr("href");

                                if (!href) return;

                                if (overridePxl && href.includes("pixeldrain.dev/u/")) {
                                    href = overridePxl;
                                }

                                if (
                                    href.startsWith("https://cdn.") ||
                                    href.includes("latent.click") ||
                                    href.includes("gpdl.hubcloud.cx") ||
                                    href.includes("pixel.hubcloud.cx") ||
                                    href.includes("pixeldrain") ||
                                    href.includes("bzzhr.co") ||
                                    href.includes("gigabytes.icu")
                                ) {
                                    if (!rawLinks.includes(href)) {
                                        rawLinks.push(href);
                                    }
                                }

                            });

                            for (const link of rawLinks) {
                                if (link.includes("gpdl.hubcloud.cx")) {
                                    try {
                                        const gpdlPage = await axios.get(link, {
                                            headers: { "User-Agent": "Mozilla/5.0" },
                                            timeout: 10000
                                        });
                                        const $$$$ = cheerio.load(gpdlPage.data);
                                        const finalGpdlLink = $$$$("#downloadBtn").attr("href");
                                        if (finalGpdlLink) {
                                            extractedLinks.push(finalGpdlLink);
                                        } else {
                                            extractedLinks.push(link);
                                        }
                                    } catch (e) {
                                        extractedLinks.push(link);
                                    }
                                } else {
                                    extractedLinks.push(link);
                                }
                            }

                        }

                    } else if (finalUrl.includes("gdflix") || finalUrl.includes("vcloud") || $(a).text().toLowerCase().includes("gdflix") || $(a).text().toLowerCase().includes("vcloud")) {
                        
                        try {
                            const browser = await chromium.launch({
                                headless: true, // using true for the express server
                            });
                            
                            const page = await browser.newPage();
                            
                            await page.goto(finalUrl, {
                                waitUntil: "domcontentloaded",
                            });
                            
                            // Wait until Cloudflare finishes
                            await page.waitForLoadState("networkidle");
                            
                            const html = await page.content();
                            const $$ = cheerio.load(html);
                            
                            $$("a.btn").each((_, el) => {
                                let href = $$(el).attr("href");
                                if (href && !href.startsWith("#")) {
                                    // Handle relative URLs
                                    if (href.startsWith("/")) {
                                        try {
                                            const parsed = new URL(finalUrl);
                                            href = parsed.origin + href;
                                        } catch (e) {}
                                    }
                                    
                                    if (!extractedLinks.includes(href)) {
                                        extractedLinks.push(href);
                                    }
                                }
                            });
                            
                            await browser.close();
                        } catch (e) {
                            console.log("GDFlix extraction failed:", e.message);
                        }

                    }

                } catch (err) {
                    console.log("HubCloud extraction failed:", err.message);
                }

                downloads.push({
                    quality,
                    server: $(a).text().trim(),
                    url: finalUrl,
                    mirrors: extractedLinks
                });

            }

        }

        res.json({
            title,
            downloads
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({
            error: "Failed to scrape movie."
        });
    }
});



// ================= HLS PROXY =================

const SOURCE_REFERER = "https://net52.cc/";
const SOURCE_ORIGIN = "https://net52.cc";

app.get("/proxy", async (req, res) => {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
        return res.status(400).send("Missing url parameter");
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                Referer: SOURCE_REFERER,
                Origin: SOURCE_ORIGIN,
                Accept: "*/*",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
            }
        });

        if (targetUrl.includes(".m3u8")) {
            let playlist = await response.text();
            const base = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

            playlist = playlist.split("\n").map(line => {
                let trimmed = line.trim();
                if (!trimmed) return line;

                if (trimmed.startsWith("#EXT-X-MEDIA:") && trimmed.includes('URI="')) {
                    return trimmed.replace(/URI="([^"]+)"/, (match, p1) => {
                        const abs = new URL(p1, base).href;
                        return `URI="/proxy?url=${encodeURIComponent(abs)}"`;
                    });
                }

                if (trimmed.startsWith("#")) return line;

                const absolute = new URL(trimmed, base).href;
                return `/proxy?url=${encodeURIComponent(absolute)}`;
            }).join("\n");

            res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "*");
            res.send(playlist);
        } else {
            res.setHeader("Content-Type", response.headers.get("content-type") || "video/mp2t");
            res.setHeader("Access-Control-Allow-Origin", "*");
            
            const buffer = Buffer.from(await response.arrayBuffer());
            res.send(buffer);
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Proxy error");
    }
});

// ================= PLAYER =================

import path from 'path';
app.get("/player", (req, res) => {
    res.sendFile(path.join(process.cwd(), "testing-net-player.html"));
});


// ================= START =================

app.listen(PORT, () => {
    console.log("Server running on http://localhost:" + PORT);
});

export default app;