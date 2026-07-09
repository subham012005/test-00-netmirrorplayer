const player = document.getElementById("player");
const playerWrapper = document.getElementById("playerWrapper");
const embedLoader = document.getElementById("embedLoader");
const videoLoaderContainer = document.getElementById("videoLoaderContainer");
const loaderText = document.getElementById("loaderText");

const loaderPhrases = [
  "Getting data...",
  "Coming up with something great...",
  "Hold on bro...",
  "Wait for a sec...",
  "Almost there bro, stay connected...",
  "Grabbing the popcorn...",
  "Summoning the pixels...",
  "Polishing the frames...",
  "Warming up the projector...",
  "Feeding the server hamsters...",
  "Downloading more RAM...",
  "Untangling the web cables...",
  "Brewing some digital coffee...",
  "Looking for the play button...",
  "Convincing the internet to be fast...",
  "Rolling out the red carpet...",
  "Telling the bits and bytes to hurry up..."
];
let phraseInterval;

function showLoader() {
  if (videoLoaderContainer.style.display === "block") return;
  videoLoaderContainer.style.display = "block";
  loaderText.textContent = loaderPhrases[Math.floor(Math.random() * loaderPhrases.length)];
  phraseInterval = setInterval(() => {
    loaderText.style.opacity = 0;
    setTimeout(() => {
      loaderText.textContent = loaderPhrases[Math.floor(Math.random() * loaderPhrases.length)];
      loaderText.style.transition = "opacity 0.3s";
      loaderText.style.opacity = 1;
    }, 300);
  }, 2500);
}

function hideLoader() {
  videoLoaderContainer.style.display = "none";
  clearInterval(phraseInterval);
}

// Video Loading Events
player.addEventListener("waiting", showLoader);
player.addEventListener("loadstart", showLoader);
player.addEventListener("canplay", hideLoader);
player.addEventListener("playing", hideLoader);

// Control elements
const playPauseIcon = document.getElementById("playPauseIcon");
const volumeIcon = document.getElementById("volumeIcon");
const volumeSlider = document.getElementById("volumeSlider");
const timeDisplay = document.getElementById("timeDisplay");
const fullscreenIcon = document.getElementById("fullscreenIcon");
const movieTitleDisplay = document.getElementById("movieTitleDisplay");

const progressContainer = document.getElementById("progressContainer");
const progressFill = document.getElementById("progressFill");
const progressBuffer = document.getElementById("progressBuffer");
const progressThumb = document.getElementById("progressThumb");
const progressTooltip = document.getElementById("progressTooltip");

const settingsPopup = document.getElementById("settingsPopup");
const qualityPopup = document.getElementById("qualityPopup");
const languagePopup = document.getElementById("languagePopup");
const captionsPopup = document.getElementById("captionsPopup");
const fitValueDisplay = document.getElementById("fitValueDisplay");

// API data
let movieData = null;
let hls = null;
let currentFit = 100;
let isMenuOpen = false;

// Helpers
function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// 1. Initialization and API Fetching
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const type = urlParams.get("type") || "movie";
  const tmdbId = urlParams.get("tmdbId") || urlParams.get("id");
  const season = urlParams.get("season") || urlParams.get("s") || 1;
  const episode = urlParams.get("episode") || urlParams.get("e") || 1;
  const directUrl = urlParams.get("url");

  const subjectId = urlParams.get("subjectId");
  const detailPath = urlParams.get("detailPath");
  const se = urlParams.get("se") || 0;
  const ep = urlParams.get("ep") || 0;
  const playUrl = urlParams.get("playUrl");

  if (subjectId && detailPath) {
    try {
      const res = await fetch(`/api/download?subjectId=${subjectId}&detailPath=${encodeURIComponent(detailPath)}&se=${se}&ep=${ep}`);
      const json = await res.json();

      const downloads = json?.data?.downloads || [];
      const captions = json?.data?.captions || [];

      let sources = downloads.map(d => ({
        url: `/api/file?url=${encodeURIComponent(d.url)}`,
        type: d.url.includes(".m3u8") ? "hls" : "mp4",
        language: "English",
        quality: d.resolution,
        direct: true
      }));

      if (playUrl) {
        const selected = sources.find(s => s.url === playUrl);
        if (selected) {
          sources = [selected, ...sources.filter(s => s.url !== playUrl)];
        }
      }

      movieData = {
        sources: sources,
        subtitles: captions.map(c => ({
          url: `/api/subtitle?url=${encodeURIComponent(c.url)}`,
          langCode: c.lan || "en",
          label: c.lanName || c.lan
        }))
      };

      movieTitleDisplay.textContent = urlParams.get("title") || "Playing Video";
      renderLanguages();
      loadSubtitles();
      playFirstSelectedLanguageSource();
      embedLoader.style.display = "none";
      return;
    } catch (err) {
      console.error(err);
      movieTitleDisplay.textContent = "Error loading streams";
      embedLoader.style.display = "none";
      return;
    }
  }

  if (directUrl) {
    movieData = {
      sources: [
        {
          url: directUrl,
          type: directUrl.includes(".m3u8") ? "hls" : "mp4",
          language: "English",
          direct: true
        }
      ]
    };
    movieTitleDisplay.textContent = urlParams.get("title") || "Playing Video";
    renderLanguages();
    loadSubtitles();
    playFirstSelectedLanguageSource();
    embedLoader.style.display = "none";
    return;
  }

  if (!tmdbId) {
    movieTitleDisplay.textContent = "Error: Missing id parameter (e.g. ?type=movie&id=123)";
    return;
  }

  movieTitleDisplay.textContent = `Loading...`;
  embedLoader.style.display = "block";

  try {
    let apiUrl = type === "movie"
      ? `/api/movie/${tmdbId}`
      : `/api/tv/${tmdbId}/${season}/${episode}`;

    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Failed to load content");

    movieData = await res.json();

    if (!movieData.sources || movieData.sources.length === 0) {
      throw new Error("No sources found");
    }

    movieTitleDisplay.textContent = type === "movie"
      ? `Movie: ${tmdbId}`
      : `TV: S${season} E${episode}`;

    renderLanguages();
    loadSubtitles();
    playFirstSelectedLanguageSource();
  } catch (err) {
    console.error(err);
    movieTitleDisplay.textContent = err.message;
  } finally {
    embedLoader.style.display = "none";
  }
}

function renderLanguages() {
  const languages = [...new Set(movieData.sources.map(s => s.language || "Unknown"))];

  const tabAudio = document.getElementById("tabAudio");
  if (languages.length <= 1) {
    if (tabAudio) tabAudio.style.display = "none";
  } else {
    if (tabAudio) tabAudio.style.display = "block";
  }

  languagePopup.innerHTML = "";
  languages.forEach(lang => {
    const btn = document.createElement("button");
    btn.className = "tab-btn";
    btn.style.width = "100%";
    btn.style.marginBottom = "5px";
    btn.textContent = lang;
    btn.onclick = () => {
      currentLanguage = lang;
      playFirstSelectedLanguageSource();
      toggleSettings();
    };
    languagePopup.appendChild(btn);
  });
}

let currentLanguage = null;
let currentLanguageSources = [];

function playFirstSelectedLanguageSource() {
  if (!currentLanguage) {
    const langs = [...new Set(movieData.sources.map(s => s.language || "Unknown"))];
    currentLanguage = langs[0];
  }

  currentLanguageSources = movieData.sources.filter(s => (s.language || "Unknown") === currentLanguage);
  if (currentLanguageSources.length > 0) {
    playSource(currentLanguageSources[0]);
  }
}

function buildPlayUrl(source) {
  if (source.direct) return source.url;

  const headers = encodeURIComponent(JSON.stringify(source.headers || {}));
  const isHls = source.type === "hls" || source.url.includes(".m3u8");
  if (isHls) {
    return `/hls-proxy?provider=moviebox&url=${encodeURIComponent(source.url)}&headers=${headers}`;
  }
  return `/mp4-proxy?provider=moviebox&url=${encodeURIComponent(source.url)}&headers=${headers}`;
}

function loadSubtitles() {
  player.querySelectorAll("track").forEach(t => t.remove());
  if (captionsPopup) captionsPopup.innerHTML = "";

  if (movieData.subtitles) {
    const offBtn = document.createElement("button");
    offBtn.className = "tab-btn active";
    offBtn.style.width = "100%";
    offBtn.style.marginBottom = "5px";
    offBtn.textContent = "Off";
    offBtn.onclick = () => {
      setSubtitleTrack(-1);
      toggleSettings();
    };
    if (captionsPopup) captionsPopup.appendChild(offBtn);

    movieData.subtitles.forEach((sub, i) => {
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = sub.label || sub.langCode;
      track.srclang = sub.langCode || "en";
      track.src = sub.url;
      player.appendChild(track);

      const btn = document.createElement("button");
      btn.className = "tab-btn";
      btn.style.width = "100%";
      btn.style.marginBottom = "5px";
      btn.textContent = track.label;
      btn.onclick = () => {
        setSubtitleTrack(i);
        toggleSettings();
      };
      if (captionsPopup) captionsPopup.appendChild(btn);
    });
  }
}

function setSubtitleTrack(index) {
  for (let i = 0; i < player.textTracks.length; i++) {
    player.textTracks[i].mode = (i === index) ? "showing" : "hidden";
  }

  if (captionsPopup) {
    const btns = captionsPopup.querySelectorAll(".tab-btn");
    btns.forEach((btn, i) => {
      if (i === index + 1) btn.classList.add("active");
      else btn.classList.remove("active");
    });
  }
}

function playSource(source) {
  const currentTime = player.currentTime || 0;
  const wasPlaying = !player.paused;

  const playUrl = buildPlayUrl(source);

  if (hls) {
    hls.destroy();
    hls = null;
  }

  player.pause();
  player.removeAttribute("src");
  player.load();

  const isHls = source.type === "hls" || playUrl.includes("/hls-proxy");

  player.addEventListener("loadedmetadata", () => {
    // Default to off, let the user select via settings menu
    if (currentTime > 0) player.currentTime = currentTime;
  }, { once: true });

  if (isHls && window.Hls && Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false
    });
    hls.loadSource(playUrl);
    hls.attachMedia(player);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      renderQualitiesHLS(hls.levels);
      const qDisplay = document.getElementById("currentQualityDisplay");
      if (qDisplay) qDisplay.textContent = "Auto";
      if (wasPlaying || currentTime === 0) player.play().catch(console.error);
    });
    hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      const qDisplay = document.getElementById("currentQualityDisplay");
      if (qDisplay && hls.autoLevelEnabled) {
        const height = hls.levels[data.level]?.height;
        if (height) qDisplay.textContent = `Auto (${height}p)`;
      }
    });
  } else {
    player.src = playUrl;
    player.load();
    renderQualitiesMP4(currentLanguageSources, source);
    const qDisplay = document.getElementById("currentQualityDisplay");
    let qText = source.quality || 'Auto';
    if (typeof qText === 'number' || (typeof qText === 'string' && !isNaN(qText))) qText += 'p';
    if (qDisplay) qDisplay.textContent = qText;
    if (wasPlaying || currentTime === 0) player.play().catch(console.error);
  }
}

function renderQualitiesHLS(levels) {
  qualityPopup.innerHTML = "";

  const autoBtn = document.createElement("button");
  autoBtn.className = "tab-btn";
  autoBtn.style.width = "100%";
  autoBtn.style.marginBottom = "5px";
  autoBtn.textContent = "Auto";
  autoBtn.onclick = () => {
    hls.currentLevel = -1;
    const qDisplay = document.getElementById("currentQualityDisplay");
    if (qDisplay) qDisplay.textContent = "Auto";
    toggleSettings();
  };
  qualityPopup.appendChild(autoBtn);

  levels.forEach((level, index) => {
    const btn = document.createElement("button");
    btn.className = "tab-btn";
    btn.style.width = "100%";
    btn.style.marginBottom = "5px";
    btn.textContent = `${level.height}p`;
    btn.onclick = () => {
      hls.currentLevel = index;
      const qDisplay = document.getElementById("currentQualityDisplay");
      if (qDisplay) qDisplay.textContent = `${level.height}p`;
      toggleSettings();
    };
    qualityPopup.appendChild(btn);
  });
}

function renderQualitiesMP4(sources, activeSource) {
  qualityPopup.innerHTML = "";

  sources.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (s === activeSource ? " active" : "");
    btn.style.width = "100%";
    btn.style.marginBottom = "5px";

    let qualityText = s.quality || 'Auto';
    if (typeof qualityText === 'number' || (typeof qualityText === 'string' && !isNaN(qualityText))) {
      qualityText += 'p';
    }

    btn.textContent = qualityText;
    btn.onclick = () => {
      playSource(s);
      toggleSettings();
    };
    qualityPopup.appendChild(btn);
  });
}

// 2. Player Controls
window.togglePlayPause = function () {
  if (player.paused) player.play();
  else player.pause();
}

player.addEventListener("play", () => {
  playPauseIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'; // Pause icon
  document.getElementById("centerIcon").style.opacity = 0;
});

player.addEventListener("pause", () => {
  playPauseIcon.innerHTML = '<path d="M8 5v14l11-7z"/>'; // Play icon
  document.getElementById("centerSvg").innerHTML = '<path d="M8 5v14l11-7z"/>';
  document.getElementById("centerIcon").style.opacity = 1;
});

document.getElementById("videoClickArea").addEventListener("click", togglePlayPause);
document.getElementById("centerIcon").addEventListener("click", togglePlayPause);

// Volume
window.toggleMute = function () {
  player.muted = !player.muted;
  if (!player.muted && player.volume === 0) {
    player.volume = 1;
    volumeSlider.value = 1;
  }
  updateVolumeIcon();
}

volumeSlider.addEventListener("input", (e) => {
  player.volume = e.target.value;
  player.muted = player.volume === 0;
  updateVolumeIcon();
});

function updateVolumeIcon() {
  if (player.muted || player.volume === 0) {
    volumeIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
  } else if (player.volume < 0.5) {
    volumeIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
  } else {
    volumeIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
  }
}

// Fullscreen
window.toggleFullScreen = function () {
  if (!document.fullscreenElement) {
    playerWrapper.requestFullscreen().catch(err => console.log(err));
  } else {
    document.exitFullscreen();
  }
}

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) {
    fullscreenIcon.innerHTML = '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>';
  } else {
    fullscreenIcon.innerHTML = '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
  }
});

// Progress Bar
player.addEventListener("timeupdate", () => {
  const current = player.currentTime;
  const duration = player.duration;
  if (duration) {
    const percent = (current / duration) * 100;
    progressFill.style.width = `${percent}%`;
    progressThumb.style.left = `${percent}%`;
    timeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  }
});

player.addEventListener("progress", () => {
  if (player.buffered.length > 0) {
    const bufferedEnd = player.buffered.end(player.buffered.length - 1);
    const duration = player.duration;
    if (duration) {
      progressBuffer.style.width = `${(bufferedEnd / duration) * 100}%`;
    }
  }
});

progressContainer.addEventListener("mousemove", (e) => {
  const rect = progressContainer.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  if (player.duration) {
    const tooltipTime = pos * player.duration;
    progressTooltip.textContent = formatTime(tooltipTime);
    progressTooltip.style.left = `${pos * 100}%`;
    progressTooltip.style.display = "block";
  }
});

progressContainer.addEventListener("mouseleave", () => {
  progressTooltip.style.display = "none";
});

progressContainer.addEventListener("click", (e) => {
  const rect = progressContainer.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  if (player.duration) {
    player.currentTime = pos * player.duration;
  }
});

// Settings & Tabs
window.toggleSettings = function (e) {
  if (e) e.stopPropagation();
  isMenuOpen = !isMenuOpen;
  settingsPopup.style.display = isMenuOpen ? "block" : "none";
  const btn = document.getElementById("settingsBtn");
  if (btn) {
    if (isMenuOpen) btn.classList.add("rotate");
    else btn.classList.remove("rotate");
  }
}

document.addEventListener("click", (e) => {
  if (isMenuOpen && !e.target.closest('#settingsMenuContainer')) {
    isMenuOpen = false;
    settingsPopup.style.display = "none";
    const btn = document.getElementById("settingsBtn");
    if (btn) btn.classList.remove("rotate");
  }
});

window.switchTab = function (tabId, element) {
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-header .tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  element.classList.add("active");
};

// Video Fit
window.adjustFit = function (amount) {
  currentFit += amount;
  currentFit = Math.max(50, Math.min(150, currentFit));
  player.style.transform = `scale(${currentFit / 100})`;
  fitValueDisplay.textContent = `${currentFit}%`;
};

// Subtitle Size
let currentSubtitleSize = 100;
window.adjustSubtitleSize = function (amount) {
  currentSubtitleSize += amount;
  currentSubtitleSize = Math.max(50, Math.min(300, currentSubtitleSize));
  document.getElementById("subtitleSizeDisplay").textContent = `${currentSubtitleSize}%`;
  player.style.setProperty('--subtitle-size', `${currentSubtitleSize}%`);
};

// Skip Intro
window.skipIntro = function () {
  player.currentTime += 10;
};

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.key === " ") {
    e.preventDefault();
    togglePlayPause();
  } else if (e.key.toLowerCase() === "f") {
    toggleFullScreen();
  } else if (e.key.toLowerCase() === "m") {
    toggleMute();
  } else if (e.key === "ArrowRight") {
    player.currentTime += 10;
  } else if (e.key === "ArrowLeft") {
    player.currentTime -= 10;
  }
});

// Inactivity hide controls
let timeout;
function resetControlsTimeout() {
  document.querySelector(".controls-overlay").style.opacity = 1;
  document.body.style.cursor = "default";
  player.style.setProperty('--subtitle-offset', '-100px');
  clearTimeout(timeout);
  if (!player.paused) {
    timeout = setTimeout(() => {
      if (!isMenuOpen) {
        document.querySelector(".controls-overlay").style.opacity = 0;
        document.body.style.cursor = "none";
        player.style.setProperty('--subtitle-offset', '0px');
      }
    }, 3000);
  }
}

playerWrapper.addEventListener("mousemove", resetControlsTimeout);
playerWrapper.addEventListener("mouseleave", () => {
  if (!player.paused && !isMenuOpen) {
    document.querySelector(".controls-overlay").style.opacity = 0;
    player.style.setProperty('--subtitle-offset', '0px');
  }
});
player.addEventListener("play", resetControlsTimeout);
player.addEventListener("pause", () => {
  document.querySelector(".controls-overlay").style.opacity = 1;
  document.body.style.cursor = "default";
  player.style.setProperty('--subtitle-offset', '-100px');
  clearTimeout(timeout);
});

init();
