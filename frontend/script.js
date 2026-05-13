// Check if STREAM feature is enabled (only in local deployment)
const STREAM_ENABLED = true;

// Voices and roles dictionary (loaded from voices.json)
let voicesData = {};
let voices = {};

// Current TTS language
let currentTtsLang = 'ru-RU';

// Dropdowns and parameters
let currentVoice = '';
let currentRole = '';
let currentTtsLangLabel = 'Русский';
let currentSpeed = 1.0;
let currentPitchShift = 0;
let currentVolume = -19;
let currentFormat = 'WAV';
let currentNormType = 'LUFS';

// STT example selection
let sttExampleKey = null;

// Currently playing TTS audio (stopped before each new request/playback)
let currentAudio = null;

// Last synthesized audio URL and the text/params it was generated from
var currentAudioUrl = null;
var lastSynthesizedText = null;
var lastSynthesizedParams = null;

var ICON_PLAY  = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
var ICON_PAUSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg>';
var ICON_VOL   = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
var ICON_MUTE  = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';

function updateTtsUI() {
    var hasAudio = !!currentAudioUrl;
    var textInput = document.getElementById('textInput');
    var textDirty = hasAudio && textInput && (textInput.value !== lastSynthesizedText);
    var paramsDirty = hasAudio && lastSynthesizedParams && (
        currentVoice     !== lastSynthesizedParams.voice  ||
        currentRole      !== lastSynthesizedParams.role   ||
        currentSpeed     !== lastSynthesizedParams.speed  ||
        currentPitchShift !== lastSynthesizedParams.pitchShift ||
        currentVolume    !== lastSynthesizedParams.volume ||
        currentFormat    !== lastSynthesizedParams.format ||
        currentNormType  !== lastSynthesizedParams.normType ||
        currentTtsLang   !== lastSynthesizedParams.lang
    );
    var isDirty = textDirty || paramsDirty;

    var muteBtn      = document.getElementById('ttsMuteBtn');
    var playPauseBtn = document.getElementById('ttsPlayPauseBtn');
    var downloadBtn  = document.getElementById('ttsDownloadBtn');
    var sendBtn      = document.getElementById('sendButton');
    if (!muteBtn || !sendBtn) return;

    var seekbar = document.getElementById('ttsSeekbar');
    if (seekbar) seekbar.classList.toggle('hidden', !hasAudio);
    muteBtn.classList.toggle('hidden', !hasAudio);
    playPauseBtn.classList.toggle('hidden', !hasAudio);
    downloadBtn.classList.toggle('hidden', !hasAudio);
    sendBtn.classList.toggle('hidden', hasAudio && !isDirty);

    if (hasAudio) {
        var isPlaying = currentAudio && !currentAudio.paused && !currentAudio.ended;
        var isMuted   = currentAudio && currentAudio.muted;
        playPauseBtn.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
        playPauseBtn.title     = isPlaying ? 'Пауза' : 'Воспроизвести';
        muteBtn.innerHTML = isMuted ? ICON_MUTE : ICON_VOL;
        muteBtn.title     = isMuted ? 'Включить звук' : 'Выключить звук';
    }
}

function attachAudioListeners(audio) {
    audio.addEventListener('play',           updateTtsUI);
    audio.addEventListener('pause',          updateTtsUI);
    audio.addEventListener('ended',          updateTtsUI);
    audio.addEventListener('timeupdate',     updateSeekbar);
    audio.addEventListener('seeked',         updateSeekbar);
    audio.addEventListener('loadedmetadata', updateSeekbarDuration);
    audio.addEventListener('durationchange', updateSeekbarDuration);
}

function updateSeekbar() {
    if (!currentAudio || !currentAudio.duration || isNaN(currentAudio.duration)) return;
    var pct = (currentAudio.currentTime / currentAudio.duration) * 100;
    var fill = document.getElementById('ttsSeekbarFill');
    if (fill) fill.style.width = pct + '%';
}

function updateSeekbarDuration() {
    if (!currentAudio || !currentAudio.duration || isNaN(currentAudio.duration)) return;
    var el = document.getElementById('ttsSeekbarDuration');
    if (el) el.textContent = formatAudioTime(currentAudio.duration);
}

function formatAudioTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}

// Default demo texts per TTS language
var ttsDefaultTexts = {
    'ru-RU': 'Привет!\nЯ Яндекс Спичк+ит.\nЯ могу превратить любой текст в речь.\nТеперь и вы - можете!',
    'kk-KZ': 'Сәлем!\nМен Яндекс Спичкитпін.\nМен кез келген мәтінді сөзге айналдыра аламын.\nЕнді сіз де жасай аласыз!',
    'uz-UZ': 'Assalomu alaykum!\nMen [[j a n d e k s]] SpeechKit\'man.\nMen istalgan matnni nutqqa o\'gira olaman.\nVa endi siz ham buni bajara olasiz!',
    'en-US': 'Hi there!\nI\'m Yandex SpeechKit.\nI can turn any text into speech.\nAnd now, so can you!',
    'de-DE': 'Hallo!\nIch bin Yandex SpeechKit.\nIch kann jeden Text in Sprache umwandeln.\nSie können das jetzt auch!',
    'he-IL': 'שלום לך!\nאני יאנדקס דיבורזה.\nאני יכול להפוך כל טקסט לדיבור.\nועכשיו, גם אתה יכול!'
};

// Add CSS for dropdowns
document.addEventListener('DOMContentLoaded', function() {
    // Enable STREAM tab if feature is enabled
    if (STREAM_ENABLED) {
        document.body.classList.add('stream-enabled');
        setupStreamRecognition();
    }
    
    // Setup tabs
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
    
    // Load TTS examples
    var ttsExamples = {};
    fetch('examples.json')
        .then(function(resp) { return resp.json(); })
        .then(function(data) {
            ttsExamples = data;
        })
        .catch(function(err) {
            console.error('Failed to load examples.json:', err);
        });

    function pasteExample(key) {
        var text = ttsExamples[key] || '';
        var textArea = document.getElementById('textInput');
        textArea.value = text;
        var maxLength = textArea.getAttribute('maxlength');
        document.getElementById('charCount').textContent = text.length + '/' + maxLength;
    }

    document.getElementById('exampleBtn1').addEventListener('click', function() { pasteExample('example-1'); });
    document.getElementById('exampleBtn2').addEventListener('click', function() { pasteExample('example-2'); });
    document.getElementById('exampleBtn3').addEventListener('click', function() { pasteExample('example-3'); });

    // Load voices data and initialize TTS components
    fetch('voices.json')
        .then(function(resp) { return resp.json(); })
        .then(function(data) {
            voicesData = data;
            switchTtsLanguage(currentTtsLang);
        })
        .catch(function(err) {
            console.error('Failed to load voices.json:', err);
        });

    // Setup TTS language dropdown
    document.getElementById('ttsLangDropdown').addEventListener('click', function() {
        document.getElementById('ttsLangDropdownContent').classList.toggle('show');
    });

    var ttsLangOptions = [
        { label: 'Русский', value: 'ru-RU' },
        { label: 'Английский', value: 'en-US' },
        { label: 'Казахский', value: 'kk-KZ' },
        { label: 'Узбекский', value: 'uz-UZ' },
        { label: 'Немецкий', value: 'de-DE' },
        { label: 'Иврит', value: 'he-IL' },
    ];
    var ttsLangDropdownContent = document.getElementById('ttsLangDropdownContent');
    ttsLangOptions.forEach(function(opt) {
        var item = document.createElement('a');
        item.textContent = opt.label;
        item.onclick = function() {
            currentTtsLang = opt.value;
            currentTtsLangLabel = opt.label;
            document.getElementById('ttsLangDropdown').textContent = opt.label;
            ttsLangDropdownContent.classList.remove('show');
            switchTtsLanguage(opt.value);
            setTtsDefaultText(opt.value);
        };
        ttsLangDropdownContent.appendChild(item);
    });

    // Setup dropdown toggles
    document.getElementById('voicesDropdown').addEventListener('click', function() {
        document.getElementById('voicesDropdownContent').classList.toggle('show');
    });
    
    document.getElementById('rolesDropdown').addEventListener('click', function() {
        document.getElementById('rolesDropdownContent').classList.toggle('show');
    });
    
    document.getElementById('formatDropdown').addEventListener('click', function() {
        document.getElementById('formatDropdownContent').classList.toggle('show');
    });
    
    document.getElementById('normDropdown').addEventListener('click', function() {
        document.getElementById('normDropdownContent').classList.toggle('show');
    });
    
    // Populate format dropdown
    const formatOptions = ['WAV', 'OGG_OPUS', 'MP3'];
    const formatDropdownContent = document.getElementById('formatDropdownContent');
    formatOptions.forEach(function(fmt) {
        const item = document.createElement('a');
        item.textContent = fmt;
        item.onclick = function() {
            currentFormat = fmt;
            document.getElementById('formatDropdown').textContent = fmt;
            formatDropdownContent.classList.remove('show');
            updateTtsUI();
        };
        formatDropdownContent.appendChild(item);
    });
    
    // Populate normalization type dropdown
    const normOptions = [
        { label: 'LUFS', value: 'LUFS' },
        { label: 'MAX_PEAK', value: 'MAX_PEAK' }
    ];
    const normDropdownContent = document.getElementById('normDropdownContent');
    normOptions.forEach(function(opt) {
        const item = document.createElement('a');
        item.textContent = opt.label;
        item.onclick = function() {
            currentNormType = opt.value;
            document.getElementById('normDropdown').textContent = opt.label;
            normDropdownContent.classList.remove('show');
            updateVolumeSliderRange();
            updateTtsUI();
        };
        normDropdownContent.appendChild(item);
    });
    
    // Slider event listeners
    document.getElementById('speedSlider').addEventListener('input', function() {
        currentSpeed = parseFloat(this.value);
        document.getElementById('speedValue').textContent = currentSpeed.toFixed(1);
        updateTtsUI();
    });

    document.getElementById('pitchSlider').addEventListener('input', function() {
        currentPitchShift = parseInt(this.value);
        document.getElementById('pitchValue').textContent = currentPitchShift;
        updateTtsUI();
    });

    document.getElementById('volumeSlider').addEventListener('input', function() {
        currentVolume = parseFloat(this.value);
        document.getElementById('volumeValue').textContent = currentVolume;
        updateTtsUI();
    });
    
    function updateVolumeSliderRange() {
        const slider = document.getElementById('volumeSlider');
        const valueLabel = document.getElementById('volumeValue');
        if (currentNormType === 'LUFS') {
            slider.min = '-145';
            slider.max = '-0.1';
            slider.step = '0.1';
            slider.value = '-19';
            currentVolume = -19;
            valueLabel.textContent = '-19';
        } else {
            slider.min = '0.1';
            slider.max = '1';
            slider.step = '0.01';
            slider.value = '0.7';
            currentVolume = 0.7;
            valueLabel.textContent = '0.7';
        }
    }
    
    // Reset sliders button
    document.getElementById('resetSlidersBtn').addEventListener('click', function() {
        // Speed
        currentSpeed = 1.0;
        document.getElementById('speedSlider').value = '1.0';
        document.getElementById('speedValue').textContent = '1.0';
        
        // Pitch
        currentPitchShift = 0;
        document.getElementById('pitchSlider').value = '0';
        document.getElementById('pitchValue').textContent = '0';
        
        // Normalization type
        currentNormType = 'LUFS';
        document.getElementById('normDropdown').textContent = 'LUFS';
        
        // Volume (reset range then value)
        var slider = document.getElementById('volumeSlider');
        slider.min = '-145';
        slider.max = '-0.1';
        slider.step = '0.1';
        slider.value = '-19';
        currentVolume = -19;
        document.getElementById('volumeValue').textContent = '-19';
        updateTtsUI();
    });
    
    // Close dropdowns when clicking outside
    window.addEventListener('click', function(event) {
        if (!event.target.matches('#voicesDropdown')) {
            const dropdown = document.getElementById('voicesDropdownContent');
            if (dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            }
        }
        if (!event.target.matches('#rolesDropdown')) {
            const dropdown = document.getElementById('rolesDropdownContent');
            if (dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            }
        }
        if (!event.target.matches('#ttsLangDropdown')) {
            const dropdown = document.getElementById('ttsLangDropdownContent');
            if (dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            }
        }
        if (!event.target.matches('#formatDropdown')) {
            const dropdown = document.getElementById('formatDropdownContent');
            if (dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            }
        }
        if (!event.target.matches('#normDropdown')) {
            const dropdown = document.getElementById('normDropdownContent');
            if (dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            }
        }
    });
    
});

// Set textarea to the default demo text for the given language
function setTtsDefaultText(lang) {
    var textArea = document.getElementById('textInput');
    var defaultText = ttsDefaultTexts[lang] || ttsDefaultTexts['ru-RU'] || '';
    textArea.value = defaultText;
    textArea.dir = (lang === 'he-IL') ? 'rtl' : 'ltr';
    var maxLength = textArea.getAttribute('maxlength');
    document.getElementById('charCount').textContent = defaultText.length + '/' + maxLength;
    var clearBtn = document.getElementById('clearTextBtn');
    if (defaultText.length > 0) {
        clearBtn.classList.add('visible');
    } else {
        clearBtn.classList.remove('visible');
    }
    updateTtsUI();
}

// Switch TTS language: update voices dict and repopulate dropdowns
function switchTtsLanguage(lang) {
    voices = voicesData[lang] || {};
    populateVoicesDropdown();
    // Select first available voice
    var firstVoice = Object.keys(voices)[0];
    if (firstVoice) {
        selectDefaultVoice(firstVoice);
    } else {
        currentVoice = '';
        currentRole = '';
        document.getElementById('voicesDropdown').textContent = 'Голос';
        document.getElementById('rolesDropdown').textContent = 'Амплуа';
        document.getElementById('rolesDropdownContent').innerHTML = '';
    }
}

// Populating voices dropdown
function populateVoicesDropdown() {
    const voicesDropdownContent = document.getElementById('voicesDropdownContent');
    voicesDropdownContent.innerHTML = '';
    for (const voice in voices) {
        const item = document.createElement('a');
        item.textContent = voice;
        item.onclick = function() {
            currentVoice = voice;
            populateRolesDropdown(voice);
            document.getElementById('voicesDropdown').textContent = voice;
            voicesDropdownContent.classList.remove('show');
            updateTtsUI();
        };
        voicesDropdownContent.appendChild(item);
    }
}

// Selecting default voice
function selectDefaultVoice(name) {
    currentVoice = name;
    populateRolesDropdown(name);
    document.getElementById('voicesDropdown').textContent = name;
}

// Populating roles dropdown
function populateRolesDropdown(name) {
    const roles = voices[name];
    const rolesDropdownContent = document.getElementById('rolesDropdownContent');
    rolesDropdownContent.innerHTML = '';
    
    if (!roles) return;
    
    roles.forEach((role, index) => {
        const item = document.createElement('a');
        item.textContent = role;
        item.onclick = function() {
            currentRole = role;
            document.getElementById('rolesDropdown').textContent = role;
            rolesDropdownContent.classList.remove('show');
            updateTtsUI();
        };
        rolesDropdownContent.appendChild(item);
        
        if (index === 0) {
            currentRole = role;
            document.getElementById('rolesDropdown').textContent = role;
        }
    });
}


document.addEventListener('DOMContentLoaded', function() {
    // Text area and character count
    var textArea = document.getElementById('textInput');
    var charCount = document.getElementById('charCount');
    
    // Clear button
    var clearTextBtn = document.getElementById('clearTextBtn');

    function updateClearBtn() {
        if (textArea.value.length > 0) {
            clearTextBtn.classList.add('visible');
        } else {
            clearTextBtn.classList.remove('visible');
        }
    }

    clearTextBtn.addEventListener('click', function() {
        textArea.value = '';
        charCount.textContent = '0/' + textArea.getAttribute('maxlength');
        updateClearBtn();
        textArea.focus();
    });

    // Update character count when text changes
    textArea.addEventListener('input', function() {
        var currentLength = textArea.value.length;
        var maxLength = textArea.getAttribute('maxlength');
        charCount.textContent = currentLength + '/' + maxLength;
        updateClearBtn();
        updateTtsUI();
    });

    // Initialize character count
    var currentLength = textArea.value.length;
    var maxLength = textArea.getAttribute('maxlength');
    charCount.textContent = currentLength + '/' + maxLength;
    updateClearBtn();
    
    // TTS formatting buttons
    function insertText(textToInsert) {
        var startPos = textArea.selectionStart;
        var endPos = textArea.selectionEnd;
        textArea.value = textArea.value.substring(0, startPos) + 
            textToInsert + 
            textArea.value.substring(endPos);
        textArea.focus();
        textArea.selectionStart = startPos + textToInsert.length;
        textArea.selectionEnd = startPos + textToInsert.length;
        
        // Update character count
        var currentLength = textArea.value.length;
        var maxLength = textArea.getAttribute('maxlength');
        charCount.textContent = currentLength + '/' + maxLength;
    }
    
    document.getElementById('insertPauseTiny').addEventListener('click', function() {
        insertText('<[tiny]>');
    });
    
    document.getElementById('insertPauseSmall').addEventListener('click', function() {
        insertText('<[small]>');
    });
    
    document.getElementById('insertPauseMedium').addEventListener('click', function() {
        insertText('<[medium]>');
    });
    
    document.getElementById('insertPauseLarge').addEventListener('click', function() {
        insertText('<[large]>');
    });
    
    document.getElementById('insertPauseHuge').addEventListener('click', function() {
        insertText('<[huge]>');
    });
    
    document.getElementById('insertPauseMs').addEventListener('click', function() {
        insertText('sil<[500]>');
    });

    document.getElementById('insertAccent').addEventListener('click', function() {
        var start = textArea.selectionStart;
        var end = textArea.selectionEnd;
        var selected = textArea.value.substring(start, end);
        var wrapped = '**' + (selected || ' ') + '**';
        textArea.value = textArea.value.substring(0, start) + wrapped + textArea.value.substring(end);
        var cursor = selected ? start + wrapped.length : start + 2;
        textArea.focus();
        textArea.selectionStart = cursor;
        textArea.selectionEnd = cursor;
        charCount.textContent = textArea.value.length + '/' + textArea.getAttribute('maxlength');
        updateClearBtn();
    });

    document.getElementById('insertStress').addEventListener('click', function() {
        insertText('+');
    });

    document.getElementById('insertPhoneme').addEventListener('click', function() {
        var start = textArea.selectionStart;
        textArea.value = textArea.value.substring(0, start) + '[[]]' + textArea.value.substring(start);
        textArea.focus();
        textArea.selectionStart = start + 2;
        textArea.selectionEnd = start + 2;
        charCount.textContent = textArea.value.length + '/' + textArea.getAttribute('maxlength');
        updateClearBtn();
    });
    
    // Icon button handlers
    document.getElementById('ttsMuteBtn').addEventListener('click', function() {
        if (currentAudio) {
            currentAudio.muted = !currentAudio.muted;
            updateTtsUI();
        }
    });

    document.getElementById('ttsPlayPauseBtn').addEventListener('click', function() {
        if (!currentAudioUrl) return;
        if (!currentAudio || currentAudio.ended) {
            if (currentAudio) currentAudio.pause();
            currentAudio = new Audio(currentAudioUrl);
            attachAudioListeners(currentAudio);
            currentAudio.play();
        } else if (currentAudio.paused) {
            currentAudio.play();
        } else {
            currentAudio.pause();
        }
    });

    // Seekbar: tooltip position + click-to-seek
    (function() {
        var seekbar  = document.getElementById('ttsSeekbar');
        var fill     = document.getElementById('ttsSeekbarFill');
        var tooltip  = document.getElementById('ttsSeekbarTooltip');

        function posFromEvent(e) {
            var inner = seekbar.querySelector('.tts-seekbar-inner');
            var rect  = inner.getBoundingClientRect();
            return Math.max(0, Math.min(e.clientX - rect.left, rect.width)) / rect.width;
        }

        seekbar.addEventListener('mousemove', function(e) {
            var pct = posFromEvent(e);
            if (currentAudio && currentAudio.duration) {
                tooltip.textContent = formatAudioTime(pct * currentAudio.duration);
            }
            tooltip.style.left = (e.clientX - seekbar.getBoundingClientRect().left) + 'px';
        });

        var seeking = false;
        function applySeek(e) {
            var pct = posFromEvent(e);
            if (currentAudio && currentAudio.duration) {
                currentAudio.currentTime = pct * currentAudio.duration;
                fill.style.width = (pct * 100) + '%';
            }
        }
        seekbar.addEventListener('mousedown', function(e) { seeking = true; applySeek(e); });
        document.addEventListener('mousemove', function(e) { if (seeking) applySeek(e); });
        document.addEventListener('mouseup',   function()  { seeking = false; });
    })();

    document.getElementById('ttsDownloadBtn').addEventListener('click', function() {
        if (currentAudioUrl) {
            var link = document.createElement('a');
            link.href = currentAudioUrl;
            var ext = currentFormat === 'OGG_OPUS' ? 'ogg' : currentFormat.toLowerCase();
            link.download = 'audio.' + ext;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    });

    // Send TTS request
    document.getElementById('sendButton').addEventListener('click', function() {
        var text = textArea.value;
        var sendBtn = document.getElementById('sendButton');

        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        sendBtn.classList.add('loading');
        sendBtn.disabled = true;
        document.getElementById('ttsSeekbar').classList.add('hidden');
        document.getElementById('ttsMuteBtn').classList.add('hidden');
        document.getElementById('ttsPlayPauseBtn').classList.add('hidden');
        document.getElementById('ttsDownloadBtn').classList.add('hidden');

        var snapParams = {
            voice: currentVoice, role: currentRole, speed: currentSpeed,
            pitchShift: currentPitchShift, volume: currentVolume,
            format: currentFormat, normType: currentNormType, lang: currentTtsLang
        };

        function exitLoading() {
            sendBtn.classList.remove('loading');
            sendBtn.disabled = false;
        }

        fetch('/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                voice: currentVoice,
                role: currentRole,
                speed: currentSpeed,
                pitchShift: currentPitchShift,
                volume: currentVolume,
                format: currentFormat,
                normType: currentNormType
            }),
        })
        .then(response => {
            if (response.ok) {
                response.blob().then(function(blob) {
                    exitLoading();
                    currentAudioUrl = URL.createObjectURL(blob);
                    lastSynthesizedText = text;
                    lastSynthesizedParams = snapParams;
                    currentAudio = new Audio(currentAudioUrl);
                    attachAudioListeners(currentAudio);
                    currentAudio.play();
                    updateTtsUI();
                });
            } else {
                console.error('HTTP Error:', response.statusText);
                exitLoading();
                updateTtsUI();
            }
        })
        .catch(function(error) {
            console.error('Error:', error);
            exitLoading();
            updateTtsUI();
        });
    });
    
    // Copy button functionality
    document.getElementById('copyJsonBtn').addEventListener('click', function() {
        const resultSttDiv = document.getElementById('resultStt');
        const textToCopy = resultSttDiv.textContent;
        var btn = this;
        
        navigator.clipboard.writeText(textToCopy).then(function() {
            var originalHTML = btn.innerHTML;
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            btn.classList.add('copied');
            setTimeout(function() {
                btn.innerHTML = originalHTML;
                btn.classList.remove('copied');
            }, 1500);
        });
    });
    
    // Prevent help links inside collapsible headers from toggling collapse
    document.querySelectorAll('.collapsible .help-link').forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
    
    // Toggle Raw JSON visibility
    document.getElementById('toggleJsonBtn').addEventListener('click', function() {
        const section = document.getElementById('rawJsonSection');
        const arrow = this.querySelector('.collapse-arrow');
        if (section.style.display === 'none') {
            section.style.display = 'block';
            arrow.classList.add('open');
        } else {
            section.style.display = 'none';
            arrow.classList.remove('open');
        }
    });
    
    // Toggle Speaker Analysis visibility
    document.getElementById('toggleSpeakerBtn').addEventListener('click', function() {
        const section = document.getElementById('speakerAnalysisSection');
        const arrow = this.querySelector('.collapse-arrow');
        if (section.style.display === 'none') {
            section.style.display = 'block';
            arrow.classList.add('open');
        } else {
            section.style.display = 'none';
            arrow.classList.remove('open');
        }
    });
    
    // Toggle Conversation Analysis visibility
    document.getElementById('toggleConversationBtn').addEventListener('click', function() {
        const section = document.getElementById('conversationAnalysisSection');
        const arrow = this.querySelector('.collapse-arrow');
        if (section.style.display === 'none') {
            section.style.display = 'block';
            arrow.classList.add('open');
        } else {
            section.style.display = 'none';
            arrow.classList.remove('open');
        }
    });
    
    // STT file input handling
    document.getElementById('fileInput').addEventListener('change', function() {
        var file = this.files[0];
        if (file && file.type === 'audio/wav') {
            document.getElementById('rateForm').classList.remove('hidden');
        } else {
            document.getElementById('rateForm').classList.add('hidden');
            document.getElementById('sampleRateInput').value = '48000';
        }
        // Clear example selection when user picks their own file
        if (file) {
            sttExampleKey = null;
            document.getElementById('sttExampleMono').classList.remove('btn-success');
            document.getElementById('sttExampleMono').classList.add('btn-secondary');
            document.getElementById('sttExampleStereo').classList.remove('btn-success');
            document.getElementById('sttExampleStereo').classList.add('btn-secondary');
        }
    });

    // STT example buttons
    function selectSttExample(key, buttonId) {
        sttExampleKey = key;
        document.getElementById('fileInput').value = '';
        document.getElementById('rateForm').classList.add('hidden');
        document.getElementById('sampleRateInput').value = '48000';
        // Highlight active button
        document.getElementById('sttExampleMono').classList.remove('btn-success');
        document.getElementById('sttExampleMono').classList.add('btn-secondary');
        document.getElementById('sttExampleStereo').classList.remove('btn-success');
        document.getElementById('sttExampleStereo').classList.add('btn-secondary');
        document.getElementById(buttonId).classList.remove('btn-secondary');
        document.getElementById(buttonId).classList.add('btn-success');
    }

    document.getElementById('sttExampleMono').addEventListener('click', function() {
        selectSttExample('example-mono.mp3', 'sttExampleMono');
    });

    document.getElementById('sttExampleStereo').addEventListener('click', function() {
        selectSttExample('example-stereo.mp3', 'sttExampleStereo');
    });
    
    // STT form submission
    document.getElementById('audioUploadForm').addEventListener('submit', function(e) {
        e.preventDefault();
        var formData = new FormData(this);
        var file = formData.get('file');
        var lang = formData.get('lang');
        var rate = formData.get('sampleRate');
        
        // Check if user selected a file or an example
        var hasFile = file && file.size > 0;
        var hasExample = !!sttExampleKey;
        
        if (!hasFile && !hasExample) {
            alert('Выберите аудиофайл или один из примеров.');
            return;
        }
        
        document.getElementById('processingStt').style.display = 'inline-block';
        document.getElementById('sendButtonStt').style.display = 'none';
        
        document.getElementById('resultStt').innerHTML = '';
        document.getElementById('dialogueSection').innerHTML = '';
        document.getElementById('speakerAnalysisSection').innerHTML = '';
        document.getElementById('conversationAnalysisSection').innerHTML = '';
        document.getElementById('speakerAnalysisSection').style.display = 'none';
        document.getElementById('conversationAnalysisSection').style.display = 'none';
        document.getElementById('toggleSpeakerBtn').querySelector('.collapse-arrow').classList.remove('open');
        document.getElementById('toggleConversationBtn').querySelector('.collapse-arrow').classList.remove('open');
        document.getElementById('summarySection').innerHTML = '';
        
        function submitSttRequest(audioBlob, fileName) {
            var fd = new FormData();
            fd.append('file', audioBlob, fileName);
            fd.append('lang', lang);
            fd.append('rate', rate);
            fd.append('summaryInstruction', document.getElementById('summaryInstructionInput').value);
            fd.append('speakerLabeling', document.getElementById('speakerLabelingToggle').checked ? 'true' : 'false');
            return fetch('/stt', { method: 'POST', body: fd }).then(function(r) { return r.json(); });
        }

        if (hasExample) {
            // Example file — fetch from static, upload directly to backend
            var exampleFileName = sttExampleKey.split('/').pop();

            fetch(sttExampleKey)
                .then(function(resp) { return resp.blob(); })
                .then(function(blob) { return submitSttRequest(blob, exampleFileName); })
                .then(function(response) {
                    console.log('STT processing initiated (example)');
                    checkOperationStatus(response.operation);
                })
                .catch(function(error) {
                    console.error('Error in STT process:', error);
                    document.getElementById('processingStt').style.display = 'none';
                    document.getElementById('sendButtonStt').style.display = 'inline-block';
                });
        } else {
            // User file — upload directly to backend
            submitSttRequest(file, file.name)
                .then(function(response) {
                    console.log('STT processing initiated');
                    checkOperationStatus(response.operation);
                })
                .catch(function(error) {
                    console.error('Error in STT process:', error);
                    document.getElementById('processingStt').style.display = 'none';
                    document.getElementById('sendButtonStt').style.display = 'inline-block';
                });
        }
    });
});

// Check STT operation status
function checkOperationStatus(operationId) {
    function checkStatus() {
        fetch(`/operation?operationId=` + operationId)
            .then(response => response.json())
            .then(response => {
                if (response.done === "true") {
                    console.log('Operation completed successfully');
                    
                    document.getElementById('processingStt').style.display = 'none';
                    document.getElementById('sendButtonStt').style.display = 'inline-block';
                    
                    // Display beautified JSON
                    var resultSttDiv = document.getElementById("resultStt");
                    var newParagraphStt = document.createElement("pre");
                    var responseTextStt = JSON.stringify(response, null, 2);
                    
                    // Beautify JSON with syntax highlighting
                    const highlighted = responseTextStt.replace(
                        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
                        function (match) {
                            let cls = 'json-number';
                            if (/^"/.test(match)) {
                                if (/:$/.test(match)) {
                                    cls = 'json-key';
                                } else {
                                    cls = 'json-string';
                                }
                            } else if (/true|false/.test(match)) {
                                cls = 'json-boolean';
                            } else if (/null/.test(match)) {
                                cls = 'json-null';
                            }
                            return '<span class="' + cls + '">' + match + '</span>';
                        }
                    );
                    
                    newParagraphStt.innerHTML = highlighted;
                    resultSttDiv.appendChild(newParagraphStt);
                    
                    // Process channel data as dialogue
                    let result = response.result.chunks;
                    const dialogueSection = document.getElementById('dialogueSection');
                    dialogueSection.innerHTML = '';
                    
                    // Determine the first channel tag to assign it as "left"
                    let leftTag = null;
                    if (result.length > 0) {
                        leftTag = result[0].channelTag;
                    }
                    
                    // Sort chunks chronologically by start time
                    result.sort(function(a, b) {
                        var aAlt = (a.alternatives && a.alternatives[0]) ? a.alternatives[0] : null;
                        var bAlt = (b.alternatives && b.alternatives[0]) ? b.alternatives[0] : null;

                        // Prefer first word's start_time_ms (most reliable), fall back to alternative-level startTimeMs
                        var aTime = 0;
                        if (aAlt && aAlt.words && aAlt.words.length > 0) {
                            aTime = parseInt(aAlt.words[0].start_time_ms) || 0;
                        } else if (aAlt) {
                            aTime = parseInt(aAlt.startTimeMs) || 0;
                        }

                        var bTime = 0;
                        if (bAlt && bAlt.words && bAlt.words.length > 0) {
                            bTime = parseInt(bAlt.words[0].start_time_ms) || 0;
                        } else if (bAlt) {
                            bTime = parseInt(bAlt.startTimeMs) || 0;
                        }

                        return aTime - bTime;
                    });

                    function formatTimestamp(ms) {
                        if (ms === undefined || ms === null || ms === 0) return '0:00.0';
                        var totalSeconds = parseInt(ms) / 1000;
                        var minutes = Math.floor(totalSeconds / 60);
                        var seconds = (totalSeconds % 60).toFixed(1);
                        if (seconds < 10) seconds = '0' + seconds;
                        return minutes + ':' + seconds;
                    }
                    
                    result.forEach(chunk => {
                        const text = chunk.alternatives.map(a => a.text).join(' ');
                        if (!text.trim()) return;
                        
                        const isLeft = (chunk.channelTag === leftTag);
                        const side = isLeft ? 'left' : 'right';
                        
                        const bubble = document.createElement('div');
                        bubble.className = 'dialogue-bubble ' + side;
                        
                        // Build tooltip from first alternative
                        const alt = chunk.alternatives[0];
                        const tooltip = document.createElement('div');
                        tooltip.className = 'bubble-tooltip';
                        
                        // Time row
                        var timeRow = document.createElement('div');
                        timeRow.className = 'tooltip-row';
                        timeRow.innerHTML = '<span class="tooltip-label">Time:</span>' +
                            formatTimestamp(alt.startTimeMs) + ' – ' + formatTimestamp(alt.endTimeMs);
                        tooltip.appendChild(timeRow);
                        
                        // Words count row
                        var wordsRow = document.createElement('div');
                        wordsRow.className = 'tooltip-row';
                        var wordCount = (alt.words && alt.words.length) ? alt.words.length : 0;
                        wordsRow.innerHTML = '<span class="tooltip-label">Words:</span>' + wordCount;
                        tooltip.appendChild(wordsRow);
                        
                        // Confidence row
                        if (alt.confidence) {
                            var confRow = document.createElement('div');
                            confRow.className = 'tooltip-row';
                            confRow.innerHTML = '<span class="tooltip-label">Confidence:</span>' +
                                (parseFloat(alt.confidence) * 100).toFixed(1) + '%';
                            tooltip.appendChild(confRow);
                        }
                        
                        // Language row
                        if (alt.languages && alt.languages.length > 0) {
                            var langRow = document.createElement('div');
                            langRow.className = 'tooltip-row';
                            var langParts = alt.languages.map(function(l) {
                                return l.language_code + ' (' + (parseFloat(l.probability) * 100).toFixed(1) + '%)';
                            });
                            langRow.innerHTML = '<span class="tooltip-label">Language:</span>' + langParts.join(', ');
                            tooltip.appendChild(langRow);
                        }
                        
                        bubble.appendChild(tooltip);
                        
                        const content = document.createElement('div');
                        content.textContent = text;
                        bubble.appendChild(content);
                        
                        dialogueSection.appendChild(bubble);
                        
                        // Clearfix after each bubble
                        const clearfix = document.createElement('div');
                        clearfix.className = 'dialogue-clearfix';
                        dialogueSection.appendChild(clearfix);
                    });

                    // Render Speaker Analysis
                    const speakerAnalysis = response.result.speakerAnalysis;
                    const speakerSection = document.getElementById('speakerAnalysisSection');
                    speakerSection.innerHTML = '';
                    
                    if (speakerAnalysis && speakerAnalysis.length > 0) {
                        speakerAnalysis.forEach(function(sa) {
                            const card = document.createElement('div');
                            card.className = 'analysis-card';
                            
                            const title = document.createElement('h6');
                            title.textContent = 'Speaker: ' + (sa.speaker_tag || 'Unknown');
                            card.appendChild(title);
                            
                            const table = document.createElement('table');
                            table.className = 'analysis-table';
                            
                            function addRow(label, value) {
                                const tr = document.createElement('tr');
                                const th = document.createElement('th');
                                th.textContent = label;
                                const td = document.createElement('td');
                                td.textContent = value;
                                tr.appendChild(th);
                                tr.appendChild(td);
                                table.appendChild(tr);
                            }
                            
                            function formatMs(ms) {
                                if (ms === undefined || ms === null) return '—';
                                var seconds = (parseInt(ms) / 1000).toFixed(1);
                                return seconds + 's';
                            }
                            
                            function formatRatio(ratio) {
                                if (ratio === undefined || ratio === null) return '—';
                                return (parseFloat(ratio) * 100).toFixed(1) + '%';
                            }
                            
                            function formatStat(stat) {
                                if (!stat) return '—';
                                return 'mean: ' + (parseFloat(stat.mean || 0)).toFixed(2) +
                                       ', min: ' + (parseFloat(stat.min || 0)).toFixed(2) +
                                       ', max: ' + (parseFloat(stat.max || 0)).toFixed(2);
                            }
                            
                            addRow('Total Speech', formatMs(sa.total_speech_ms));
                            addRow('Speech Ratio', formatRatio(sa.speech_ratio));
                            addRow('Total Silence', formatMs(sa.total_silence_ms));
                            addRow('Silence Ratio', formatRatio(sa.silence_ratio));
                            addRow('Words Count', sa.words_count || '0');
                            addRow('Letters Count', sa.letters_count || '0');
                            addRow('Utterance Count', sa.utterance_count || '0');
                            addRow('Words/sec', formatStat(sa.words_per_second));
                            addRow('Letters/sec', formatStat(sa.letters_per_second));
                            addRow('Words/utterance', formatStat(sa.words_per_utterance));
                            addRow('Letters/utterance', formatStat(sa.letters_per_utterance));
                            addRow('Utterance Duration', formatStat(sa.utterance_duration_estimation));
                            
                            if (sa.speech_boundaries) {
                                addRow('Speech Start', formatMs(sa.speech_boundaries.start_time_ms));
                                addRow('Speech End', formatMs(sa.speech_boundaries.end_time_ms));
                            }
                            
                            card.appendChild(table);
                            speakerSection.appendChild(card);
                        });
                    } else {
                        speakerSection.innerHTML = '<div class="analysis-card">No speaker analysis data available.</div>';
                    }
                    
                    // Render Conversation Analysis
                    const convAnalysis = response.result.conversationAnalysis;
                    const convSection = document.getElementById('conversationAnalysisSection');
                    convSection.innerHTML = '';
                    
                    if (convAnalysis) {
                        const card = document.createElement('div');
                        card.className = 'analysis-card';
                        
                        const table = document.createElement('table');
                        table.className = 'analysis-table';
                        
                        function addConvRow(label, value) {
                            const tr = document.createElement('tr');
                            const th = document.createElement('th');
                            th.textContent = label;
                            const td = document.createElement('td');
                            td.textContent = value;
                            tr.appendChild(th);
                            tr.appendChild(td);
                            table.appendChild(tr);
                        }
                        
                        function fmtMs(ms) {
                            if (ms === undefined || ms === null) return '—';
                            return (parseInt(ms) / 1000).toFixed(1) + 's';
                        }
                        
                        function fmtRatio(ratio) {
                            if (ratio === undefined || ratio === null) return '—';
                            return (parseFloat(ratio) * 100).toFixed(1) + '%';
                        }
                        
                        function fmtStat(stat) {
                            if (!stat) return '—';
                            return 'mean: ' + (parseFloat(stat.mean || 0)).toFixed(2) +
                                   ', min: ' + (parseFloat(stat.min || 0)).toFixed(2) +
                                   ', max: ' + (parseFloat(stat.max || 0)).toFixed(2);
                        }
                        
                        if (convAnalysis.conversation_boundaries) {
                            addConvRow('Conversation Start', fmtMs(convAnalysis.conversation_boundaries.start_time_ms));
                            addConvRow('Conversation End', fmtMs(convAnalysis.conversation_boundaries.end_time_ms));
                        }
                        
                        addConvRow('Total Speech Duration', fmtMs(convAnalysis.total_speech_duration_ms));
                        addConvRow('Total Speech Ratio', fmtRatio(convAnalysis.total_speech_ratio));
                        addConvRow('Simultaneous Silence', fmtMs(convAnalysis.total_simultaneous_silence_duration_ms));
                        addConvRow('Simultaneous Silence Ratio', fmtRatio(convAnalysis.total_simultaneous_silence_ratio));
                        addConvRow('Silence Duration Stats', fmtStat(convAnalysis.simultaneous_silence_duration_estimation));
                        addConvRow('Simultaneous Speech', fmtMs(convAnalysis.total_simultaneous_speech_duration_ms));
                        addConvRow('Simultaneous Speech Ratio', fmtRatio(convAnalysis.total_simultaneous_speech_ratio));
                        addConvRow('Speech Duration Stats', fmtStat(convAnalysis.simultaneous_speech_duration_estimation));
                        
                        card.appendChild(table);
                        
                        // Render interrupts per speaker
                        if (convAnalysis.speaker_interrupts && convAnalysis.speaker_interrupts.length > 0) {
                            convAnalysis.speaker_interrupts.forEach(function(si) {
                                const intCard = document.createElement('div');
                                intCard.style.marginTop = '10px';
                                
                                const intTitle = document.createElement('h6');
                                intTitle.textContent = 'Interrupts by ' + (si.speaker_tag || 'Unknown');
                                intTitle.style.fontSize = '0.85rem';
                                intTitle.style.marginBottom = '4px';
                                intCard.appendChild(intTitle);
                                
                                const intInfo = document.createElement('div');
                                intInfo.className = 'interrupts-list';
                                intInfo.innerHTML = 'Count: <strong>' + (si.interrupts_count || 0) +
                                    '</strong> &nbsp;|&nbsp; Total duration: <strong>' + fmtMs(si.interrupts_duration_ms) + '</strong>';
                                intCard.appendChild(intInfo);
                                
                                if (si.interrupts && si.interrupts.length > 0) {
                                    const intList = document.createElement('div');
                                    intList.className = 'interrupts-list';
                                    si.interrupts.forEach(function(seg) {
                                        const span = document.createElement('span');
                                        span.className = 'interrupt-item';
                                        span.textContent = fmtMs(seg.start_time_ms) + ' → ' + fmtMs(seg.end_time_ms);
                                        intList.appendChild(span);
                                    });
                                    intCard.appendChild(intList);
                                }
                                
                                card.appendChild(intCard);
                            });
                        }
                        
                        convSection.appendChild(card);
                    } else {
                        convSection.innerHTML = '<div class="analysis-card">No conversation analysis data available.</div>';
                    }

                    // Render Summarization
                    const summaryData = response.result.summarization;
                    const summarySection = document.getElementById('summarySection');
                    summarySection.innerHTML = '';
                    
                    if (summaryData && summaryData.results && summaryData.results.length > 0) {
                        const card = document.createElement('div');
                        card.className = 'analysis-card';
                        
                        summaryData.results.forEach(function(item) {
                            var responseText = item.response || '';
                            
                            // Strip markdown code fences if present (e.g. ```json ... ```)
                            var fenceStart = new RegExp('^' + '`'.repeat(3) + '(?:json)?\\s*\\n?');
                            var fenceEnd = new RegExp('\\n?' + '`'.repeat(3) + '\\s*$');
                            responseText = responseText.replace(fenceStart, '').replace(fenceEnd, '').trim();
                            
                            // Try to parse as JSON and pretty-print it
                            try {
                                var parsed = JSON.parse(responseText);
                                if (typeof parsed === 'object' && parsed !== null) {
                                    // Render each field as a labeled paragraph
                                    Object.keys(parsed).forEach(function(key) {
                                        var val = parsed[key];
                                        var wrapper = document.createElement('div');
                                        wrapper.style.margin = '0 0 10px 0';
                                        
                                        var label = document.createElement('div');
                                        label.style.fontSize = '0.75rem';
                                        label.style.fontWeight = '600';
                                        label.style.color = '#7f8c8d';
                                        label.style.textTransform = 'uppercase';
                                        label.style.letterSpacing = '0.5px';
                                        label.style.marginBottom = '2px';
                                        label.textContent = key;
                                        wrapper.appendChild(label);
                                        
                                        var content = document.createElement('p');
                                        content.style.margin = '0';
                                        content.style.fontSize = '0.85rem';
                                        content.style.lineHeight = '1.5';
                                        if (typeof val === 'string') {
                                            content.textContent = val;
                                        } else {
                                            content.style.fontFamily = 'monospace';
                                            content.style.whiteSpace = 'pre-wrap';
                                            content.textContent = JSON.stringify(val, null, 2);
                                        }
                                        wrapper.appendChild(content);
                                        
                                        card.appendChild(wrapper);
                                    });
                                } else {
                                    throw new Error('not an object');
                                }
                            } catch (e) {
                                // Not valid JSON — display as plain text
                                const p = document.createElement('p');
                                p.style.margin = '0 0 8px 0';
                                p.style.fontSize = '0.85rem';
                                p.style.lineHeight = '1.5';
                                p.textContent = responseText;
                                card.appendChild(p);
                            }
                        });
                        
                        if (summaryData.content_usage) {
                            const usage = document.createElement('div');
                            usage.style.fontSize = '0.75rem';
                            usage.style.color = '#7f8c8d';
                            usage.style.marginTop = '8px';
                            usage.style.borderTop = '1px solid #eee';
                            usage.style.paddingTop = '6px';
                            usage.textContent = 'Tokens: ' +
                                (summaryData.content_usage.input_text_tokens || 0) + ' input, ' +
                                (summaryData.content_usage.completion_tokens || 0) + ' completion, ' +
                                (summaryData.content_usage.total_tokens || 0) + ' total';
                            card.appendChild(usage);
                        }
                        
                        summarySection.appendChild(card);
                    } else {
                        summarySection.innerHTML = '<div class="analysis-card">No summarization data available.</div>';
                    }
                } else {
                    setTimeout(checkStatus, 5000);
                }
            })
            .catch(error => {
                console.error('Error checking operation status:', error);
                document.getElementById('processingStt').style.display = 'none';
                document.getElementById('sendButtonStt').style.display = 'inline-block';
            });
    }
    
    checkStatus();
}

function renderStreamSummary(summaryData) {
    const section = document.getElementById('streamSummarySection');
    section.innerHTML = '';

    if (summaryData && summaryData.results && summaryData.results.length > 0) {
        const card = document.createElement('div');
        card.className = 'analysis-card stream-summary';

        summaryData.results.forEach(function(item) {
            var responseText = item.response || '';

            // Strip markdown code fences if present
            var fenceStart = new RegExp('^' + '`'.repeat(3) + '(?:json)?\\s*\\n?');
            var fenceEnd = new RegExp('\\n?' + '`'.repeat(3) + '\\s*$');
            responseText = responseText.replace(fenceStart, '').replace(fenceEnd, '').trim();

            // Try to parse as JSON and pretty-print it
            try {
                var parsed = JSON.parse(responseText);
                if (typeof parsed === 'object' && parsed !== null) {
                    Object.keys(parsed).forEach(function(key) {
                        var val = parsed[key];
                        var wrapper = document.createElement('div');
                        wrapper.style.margin = '0 0 10px 0';

                        var label = document.createElement('div');
                        label.style.fontSize = '0.75rem';
                        label.style.fontWeight = '600';
                        label.style.color = '#7f8c8d';
                        label.style.textTransform = 'uppercase';
                        label.style.letterSpacing = '0.5px';
                        label.style.marginBottom = '2px';
                        label.textContent = key;
                        wrapper.appendChild(label);

                        var content = document.createElement('p');
                        content.style.margin = '0';
                        content.style.fontSize = '0.85rem';
                        content.style.lineHeight = '1.5';
                        if (typeof val === 'string') {
                            content.textContent = val;
                        } else {
                            content.style.fontFamily = 'monospace';
                            content.style.whiteSpace = 'pre-wrap';
                            content.textContent = JSON.stringify(val, null, 2);
                        }
                        wrapper.appendChild(content);
                        card.appendChild(wrapper);
                    });
                } else {
                    throw new Error('not an object');
                }
            } catch (e) {
                var p = document.createElement('p');
                p.style.margin = '0 0 8px 0';
                p.style.fontSize = '0.85rem';
                p.style.lineHeight = '1.5';
                p.textContent = responseText;
                card.appendChild(p);
            }
        });

        if (summaryData.content_usage) {
            var usage = document.createElement('div');
            usage.style.fontSize = '0.75rem';
            usage.style.color = '#7f8c8d';
            usage.style.marginTop = '8px';
            usage.style.borderTop = '1px solid #d4edda';
            usage.style.paddingTop = '6px';
            usage.textContent = 'Tokens: ' +
                (summaryData.content_usage.input_text_tokens || 0) + ' input, ' +
                (summaryData.content_usage.completion_tokens || 0) + ' completion, ' +
                (summaryData.content_usage.total_tokens || 0) + ' total';
            card.appendChild(usage);
        }

        section.appendChild(card);
    } else {
        section.innerHTML = '<div class="analysis-card stream-summary">No summarization data available.</div>';
    }
}

// Streaming recognition variables
let mediaRecorder;
let websocket;
let audioContext;
let audioWorkletNode;
let isRecording = false;
let mediaStream;

function setupStreamRecognition() {
    document.getElementById('eouPauseSlider').addEventListener('input', function() {
        document.getElementById('eouPauseValue').textContent = this.value + ' мс';
    });

    document.getElementById('startStreamBtn').addEventListener('click', startStreaming);
    document.getElementById('stopStreamBtn').addEventListener('click', stopStreaming);
    document.getElementById('clearStreamBtn').addEventListener('click', function() {
        document.getElementById('partialText').textContent = '';
        document.getElementById('finalText').innerHTML = '';
        document.getElementById('streamSummarySection').innerHTML = '';
    });
}

async function startStreaming() {
    try {
        // Request microphone access
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                channelCount: 1,
                sampleRate: 16000,
                echoCancellation: true,
                noiseSuppression: true
            } 
        });
        
        const lang = document.getElementById('streamLanguageSelect').value;
        const streamSummaryInstruction = document.getElementById('streamSummaryInstructionInput').value;
        
        // Clear previous summary
        document.getElementById('streamSummarySection').innerHTML = '';
        
        // Create WebSocket connection
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsUrl = wsProtocol + '//' + window.location.host + '/stream?lang=' + lang;
        if (streamSummaryInstruction) {
            wsUrl += '&summaryInstruction=' + encodeURIComponent(streamSummaryInstruction);
        }
        const classifiersEnabled = document.getElementById('streamClassifiersToggle').checked;
        if (classifiersEnabled) {
            wsUrl += '&classifiers=all';
        }
        const eouPause = document.getElementById('eouPauseSlider').value;
        if (eouPause !== '500') {
            wsUrl += '&eouPause=' + eouPause;
        }
        websocket = new WebSocket(wsUrl);
        
        websocket.onopen = function() {
            console.log('WebSocket connected');
            
            // Add session separator if there are previous results
            const finalDiv = document.getElementById('finalText');
            if (finalDiv.children.length > 0) {
                const sep = document.createElement('hr');
                sep.className = 'stream-separator';
                finalDiv.appendChild(sep);
            }
            
            // Setup audio recording
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const source = audioContext.createMediaStreamSource(mediaStream);
            
            // Use ScriptProcessorNode for compatibility
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = function(e) {
                if (!isRecording) return;
                
                const inputData = e.inputBuffer.getChannelData(0);
                // Convert Float32Array to Int16Array (LINEAR16_PCM)
                const int16Data = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                
                // Send audio chunk to backend
                if (websocket && websocket.readyState === WebSocket.OPEN) {
                    websocket.send(int16Data.buffer);
                }
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
            
            isRecording = true;
            document.getElementById('startStreamBtn').disabled = true;
            document.getElementById('stopStreamBtn').disabled = false;
            document.getElementById('partialText').textContent = 'Слушаю...';
        };
        
        websocket.onmessage = function(event) {
            try {
                const result = JSON.parse(event.data);
                
                if (result.type === 'error') {
                    console.error('Recognition error:', result.message);
                    document.getElementById('partialText').textContent = 'Ошибка: ' + result.message;
                    document.getElementById('partialText').style.color = '#e74c3c';
                    return;
                }
                
                if (result.type === 'partial' && result.alternatives && result.alternatives.length > 0) {
                    document.getElementById('partialText').textContent = result.alternatives[0];
                    document.getElementById('partialText').style.color = '';
                } else if (result.type === 'final' && result.alternatives && result.alternatives.length > 0) {
                    const text = result.alternatives[0].trim();
                    if (text) {
                        const finalDiv = document.getElementById('finalText');
                        const p = document.createElement('p');
                        p.className = 'stream-final';
                        p.textContent = text;
                        finalDiv.appendChild(p);
                    }
                    document.getElementById('partialText').textContent = '';
                    
                    // Auto-scroll to bottom
                    const streamResults = document.getElementById('streamResults');
                    streamResults.scrollTop = streamResults.scrollHeight;
                } else if (result.type === 'final_refinement' && result.alternatives && result.alternatives.length > 0) {
                    // Update last final text with refined version
                    const text = result.alternatives[0].trim();
                    const finalDiv = document.getElementById('finalText');
                    if (text && finalDiv.lastElementChild && finalDiv.lastElementChild.classList.contains('stream-final')) {
                        finalDiv.lastElementChild.textContent = text;
                    }
                } else if (result.type === 'classifier_update' && result.classifier_update) {
                    const cu = result.classifier_update;
                    const finalDiv = document.getElementById('finalText');

                    // Find or create badges container after the last .stream-final
                    let lastFinal = null;
                    for (let i = finalDiv.children.length - 1; i >= 0; i--) {
                        if (finalDiv.children[i].classList.contains('stream-final')) {
                            lastFinal = finalDiv.children[i];
                            break;
                        }
                    }

                    if (lastFinal) {
                        // Find existing badges div or create one
                        let badgesDiv = lastFinal.nextElementSibling;
                        if (!badgesDiv || !badgesDiv.classList.contains('stream-badges')) {
                            badgesDiv = document.createElement('div');
                            badgesDiv.className = 'stream-badges';
                            lastFinal.parentNode.insertBefore(badgesDiv, lastFinal.nextSibling);
                        }

                        const classifierName = cu.classifier || '';
                        const labels = cu.labels || [];

                        // Color mapping
                        const badgeColors = {
                            'insult': 'badge-red',
                            'profanity': 'badge-red',
                            'negative': 'badge-red',
                            'formal_greeting': 'badge-green',
                            'informal_greeting': 'badge-green',
                            'formal_farewell': 'badge-blue',
                            'informal_farewell': 'badge-blue',
                            'gender': 'badge-grey',
                            'answerphone': 'badge-grey',
                        };

                        labels.forEach(function(lbl) {
                            if (lbl.confidence >= 0.3) {
                                // For gender classifier, show the winning label
                                let displayName = classifierName;
                                if (classifierName === 'gender') {
                                    displayName = lbl.label;
                                }

                                const badge = document.createElement('span');
                                badge.className = 'stream-badge ' + (badgeColors[classifierName] || 'badge-grey');
                                badge.textContent = displayName + ' ' + Math.round(lbl.confidence * 100) + '%';
                                badgesDiv.appendChild(badge);
                            }
                        });

                        // Auto-scroll
                        const streamResults = document.getElementById('streamResults');
                        streamResults.scrollTop = streamResults.scrollHeight;
                    }
                } else if (result.type === 'summarization' && result.summarization) {
                    renderStreamSummary(result.summarization);
                }
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
            }
        };
        
        websocket.onerror = function(error) {
            console.error('WebSocket error:', error);
            document.getElementById('partialText').textContent = 'Ошибка соединения';
            document.getElementById('partialText').style.color = '#e74c3c';
            stopStreaming();
        };
        
        websocket.onclose = function() {
            console.log('WebSocket closed');
            websocket = null;
            if (isRecording) {
                isRecording = false;
                document.getElementById('startStreamBtn').disabled = false;
                document.getElementById('stopStreamBtn').disabled = true;
            }
        };
        
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Не удалось получить доступ к микрофону. Проверьте разрешения браузера.');
    }
}

function stopStreaming() {
    isRecording = false;
    
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        // Send END but don't close — let the server finish sending
        // (including summarization), then close from onclose/timeout
        websocket.send('END');
        
        // Safety timeout: if server doesn't close the connection
        // within 30 seconds (summarization can take time), force close
        setTimeout(function() {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                console.log('Force closing WebSocket after timeout');
                websocket.close();
                websocket = null;
            }
        }, 30000);
    } else {
        websocket = null;
    }
    
    document.getElementById('startStreamBtn').disabled = false;
    document.getElementById('stopStreamBtn').disabled = true;
    
    const partialText = document.getElementById('partialText');
    if (partialText.textContent === 'Слушаю...') {
        partialText.textContent = '';
    }
}
