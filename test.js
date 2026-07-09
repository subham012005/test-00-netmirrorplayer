
import http from "node:http";

const VIDEO_URL =
    "https://s13.freecdn2.top/files/0JP2YUWYYUI1Q2NN73XBXXXC2T/720p/720p.m3u8?in=0483d0e85afcc6a926f6fdc9463fde3d::718836d3f2aadb5476e7f941a43d818c::1783626455::ni";

const SOURCE_REFERER = "https://net52.cc/";
const SOURCE_ORIGIN = "https://net52.cc";


function cors(res, type) {
    res.writeHead(200, {
        "Content-Type": type,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*"
    });
}


const server = http.createServer(async (req, res) => {

    try {

        // Universal HLS Proxy for Playlists and Segments
        if (req.url.startsWith("/proxy")) {
            const targetUrl = new URL(req.url, "http://localhost").searchParams.get("url");
            
            if (!targetUrl) {
                res.writeHead(400);
                res.end("Missing url parameter");
                return;
            }

            const response = await fetch(targetUrl, {
                headers: {
                    Referer: SOURCE_REFERER,
                    Origin: SOURCE_ORIGIN,
                    Accept: "*/*"
                }
            });

            // If it's a playlist, rewrite the inner URLs
            if (targetUrl.includes(".m3u8")) {
                let playlist = await response.text();
                const base = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

                playlist = playlist.split("\n").map(line => {
                    let trimmed = line.trim();
                    if (!trimmed) return line;

                    // Rewrite URIs in #EXT-X-MEDIA (e.g., audio tracks)
                    if (trimmed.startsWith("#EXT-X-MEDIA:") && trimmed.includes('URI="')) {
                        return trimmed.replace(/URI="([^"]+)"/, (match, p1) => {
                            const abs = new URL(p1, base).href;
                            return `URI="/proxy?url=${encodeURIComponent(abs)}"`;
                        });
                    }

                    if (trimmed.startsWith("#")) return line;

                    // Rewrite direct URLs (master playlists or .ts segments)
                    const absolute = new URL(trimmed, base).href;
                    return `/proxy?url=${encodeURIComponent(absolute)}`;
                }).join("\n");

                cors(res, "application/vnd.apple.mpegurl");
                res.end(playlist);
            } else {
                // If it's a segment (.ts), stream it directly
                const buffer = Buffer.from(await response.arrayBuffer());
                res.writeHead(200, {
                    "Content-Type": response.headers.get("content-type") || "video/mp2t",
                    "Access-Control-Allow-Origin": "*"
                });
                res.end(buffer);
            }
            return;
        }



        // Test endpoint
        if (req.url === "/test") {

            const r = await fetch(VIDEO_URL, {
                headers: {
                    Referer: SOURCE_REFERER,
                    Origin: SOURCE_ORIGIN
                }
            });


            res.writeHead(200, {
                "Content-Type": "application/json"
            });


            res.end(JSON.stringify({
                status: r.status,
                ok: r.ok,
                preview: (await r.text()).slice(0, 300)
            }, null, 2));

            return;
        }



        // Player page
        res.writeHead(200, {
            "Content-Type": "text/html"
        });


        res.end(`
<!DOCTYPE html>
<html>
<head>
<title>HLS Player</title>

<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>

<style>
body{
    background:#111;
    color:white;
    text-align:center;
    font-family:Arial;
}

video{
    width:800px;
    max-width:95%;
    margin-top:30px;
}
</style>

</head>

<body>

<h2>Node HLS Proxy Player</h2>

<video id="video" controls autoplay></video>


<script>

const video =
    document.getElementById("video");


if(Hls.isSupported()){

    const hls = new Hls({
        enableWorker:true
    });


    hls.loadSource(
        "/hls/playlist.m3u8"
    );


    hls.attachMedia(video);


    hls.on(
        Hls.Events.MANIFEST_PARSED,
        ()=>{
            video.play()
            .catch(()=>{});
        }
    );


    hls.on(
        Hls.Events.ERROR,
        (event,data)=>{
            console.log(
                "HLS ERROR",
                data
            );
        }
    );


}
else if(
    video.canPlayType(
        "application/vnd.apple.mpegurl"
    )
){

    video.src =
        "/hls/playlist.m3u8";
}

</script>

<br>

<a href="/test" style="color:#0af">
Fetch Test
</a>

</body>
</html>
`);

    } catch (err) {

        console.error(err);

        res.writeHead(500);
        res.end(err.stack);
    }

});


server.listen(3000, () => {
    console.log(
        "Player running: http://localhost:3000"
    );
});
