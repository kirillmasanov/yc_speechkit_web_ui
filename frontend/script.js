// Check if STREAM feature is enabled (only in local deployment)
const STREAM_ENABLED = true;

// Base URL for all API calls — derived from the current page location so the
// app works both at the root (http://localhost:8080/) and under a path prefix
// behind a reverse proxy (https://example.com/yc-speechkit-web-ui/).
const API_BASE = new URL('.', document.baseURI).href;

// Voices and roles dictionary (loaded from voices.json)
let voicesData = {};
let voices = {};

// Current TTS language
let currentTtsLang = 'ru-RU';

// Current STT language
let currentSttLang = 'ru-RU';

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

// Snapshot of last successfully submitted STT params (for dirty-check)
var sttLastParams = null;

// Currently selected LLM model IDs
var currentLlmModel = '';
var currentStreamLlmModel = '';
var currentStreamLang = 'ru-RU';

// STT classifiers
var STT_CLASSIFIERS = [
    { id: 'formal_greeting',   label: 'Формальное приветствие',   tooltip: 'Определяет наличие в речи формальных приветствий, например «Добрый день», «Здравствуйте».' },
    { id: 'informal_greeting', label: 'Неформальное приветствие', tooltip: 'Определяет наличие в речи неформальных приветствий, например «Привет», «Хай».' },
    { id: 'formal_farewell',   label: 'Формальное прощание',      tooltip: 'Определяет наличие в речи формальных прощаний, например «До свидания», «Всего доброго».' },
    { id: 'informal_farewell', label: 'Неформальное прощание',    tooltip: 'Определяет наличие в речи неформальных прощаний, например «Пока», «Чао».' },
    { id: 'insult',            label: 'Оскорбления',              tooltip: 'Определяет наличие в речи оскорблений и грубых высказываний.' },
    { id: 'profanity',         label: 'Мат',                      tooltip: 'Определяет наличие в речи нецензурной лексики.' },
    { id: 'gender',            label: 'Пол',                      tooltip: 'Определяет пол говорящего.' },
    { id: 'negative',          label: 'Негатив',                  tooltip: 'Определяет негативную окраску речи.' },
    { id: 'answerphone',       label: 'Ответ робота',             tooltip: 'Определяет, что ответ дан голосовым ботом или автоответчиком.' },
];
var selectedClassifiers = new Set();
var selectedStreamClassifiers = new Set();

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
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
            localStorage.setItem('speechkit_tab', tabId);
        });
    });

    // Restore last active tab
    (function() {
        var saved = localStorage.getItem('speechkit_tab');
        if (!saved) return;
        if (saved === 'streamRecognition' && !STREAM_ENABLED) return;
        var tabBtn = document.querySelector('[data-tab="' + saved + '"]');
        var tabContent = document.getElementById(saved);
        if (!tabBtn || !tabContent) return;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tabBtn.classList.add('active');
        tabContent.classList.add('active');
    })();
    
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
        if (!event.target.matches('#sttLangDropdown')) {
            const dropdown = document.getElementById('sttLangDropdownContent');
            if (dropdown && dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            }
        }
        if (!event.target.matches('#llmModelDropdown')) {
            const dropdown = document.getElementById('llmModelDropdownContent');
            if (dropdown && dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            }
        }
        if (!event.target.matches('#streamLlmModelDropdown')) {
            const dropdown = document.getElementById('streamLlmModelDropdownContent');
            if (dropdown && dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            }
        }
        if (!event.target.matches('#streamLangDropdown')) {
            const dropdown = document.getElementById('streamLangDropdownContent');
            if (dropdown && dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            }
        }
        var msDropdown = document.getElementById('classifierMultiselectDropdown');
        if (msDropdown && msDropdown.style.display !== 'none') {
            var msBtn = document.getElementById('classifierMultiselectBtn');
            if (!msBtn.contains(event.target) && !msDropdown.contains(event.target)) {
                msDropdown.style.display = 'none';
            }
        }
        var streamMsDropdown = document.getElementById('streamClassifierMultiselectDropdown');
        if (streamMsDropdown && streamMsDropdown.style.display !== 'none') {
            var streamMsBtn = document.getElementById('streamClassifierMultiselectBtn');
            if (streamMsBtn && !streamMsBtn.contains(event.target) && !streamMsDropdown.contains(event.target)) {
                streamMsDropdown.style.display = 'none';
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

        fetch(API_BASE + 'tts', {
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
    
    // Toggle Statistics visibility
    document.getElementById('toggleStatsBtn').addEventListener('click', function() {
        const section = document.getElementById('statsSection');
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
        if (file) {
            if (file.type === 'audio/wav' || file.name.endsWith('.wav')) {
                document.getElementById('rateForm').classList.remove('hidden');
            } else {
                document.getElementById('rateForm').classList.add('hidden');
                document.getElementById('sampleRateInput').value = '48000';
            }
            showSttFileChip(file.name, file.size);
            sttExampleKey = null;
            sttCheckDirty();
            document.getElementById('sttExampleMono').classList.remove('btn-success');
            document.getElementById('sttExampleMono').classList.add('btn-secondary');
            document.getElementById('sttExampleStereo').classList.remove('btn-success');
            document.getElementById('sttExampleStereo').classList.add('btn-secondary');
        } else {
            hideSttFileChip();
            document.getElementById('rateForm').classList.add('hidden');
            document.getElementById('sampleRateInput').value = '48000';
        }
    });

    // STT example buttons
    function selectSttExample(key, buttonId) {
        sttExampleKey = key;
        document.getElementById('fileInput').value = '';
        document.getElementById('rateForm').classList.add('hidden');
        document.getElementById('sampleRateInput').value = '48000';
        showSttFileChip(key, null);
        sttCheckDirty();
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
        var lang = currentSttLang;
        var rate = formData.get('sampleRate');
        
        // Check if user selected a file or an example
        var hasFile = file && file.size > 0;
        var hasExample = !!sttExampleKey;
        
        if (!hasFile && !hasExample) {
            alert('Выберите аудиофайл или один из примеров.');
            return;
        }
        
        sttLastParams = null;
        sttSetLoading(true);

        document.getElementById('resultStt').innerHTML = '';
        document.getElementById('dialogueSection').innerHTML = '';
        document.getElementById('dialogueSection').style.display = '';
        document.getElementById('rawTextSection').style.display = 'none';
        document.getElementById('rawTextContent').textContent = '';
        document.getElementById('rawTextMeta').textContent = '';
        var rawToggleTrack = document.getElementById('rawTextToggleTrack');
        if (rawToggleTrack) rawToggleTrack.classList.remove('active');
        document.getElementById('speakerAnalysisSection').innerHTML = '';
        document.getElementById('conversationAnalysisSection').innerHTML = '';
        document.getElementById('statsSection').style.display = 'none';
        document.getElementById('toggleStatsBtn').querySelector('.collapse-arrow').classList.remove('open');
        document.getElementById('summarySection').innerHTML = '';
        document.getElementById('llmResultSection').style.display = 'none';
        document.getElementById('classifierResultSection').style.display = 'none';
        document.getElementById('classifierResultContent').innerHTML = '';
        
        function submitSttRequest(audioBlob, fileName) {
            var fd = new FormData();
            fd.append('file', audioBlob, fileName);
            fd.append('lang', lang);
            fd.append('rate', rate);
            fd.append('speakerLabeling', document.getElementById('speakerLabelingToggle').checked ? 'true' : 'false');
            var classifiersOn = document.getElementById('classifiersToggleTrack').classList.contains('active');
            fd.append('classifiers', classifiersOn && selectedClassifiers.size > 0
                ? Array.from(selectedClassifiers).join(',') : '');
            if (document.getElementById('llmToggleTrack').classList.contains('active')) {
                fd.append('summaryInstruction', document.getElementById('summaryInstructionInput').value);
                fd.append('llmModel', currentLlmModel);
            }
            fd.append('normalization', document.getElementById('normalizationToggle').checked ? 'true' : 'false');
            fd.append('profanityFilter', document.getElementById('profanityFilterToggle').checked ? 'true' : 'false');
            fd.append('literaryText', document.getElementById('literaryTextToggle').checked ? 'true' : 'false');
            fd.append('speakerGrouping', document.getElementById('speakerGroupingToggle').checked ? 'true' : 'false');
            return fetch(API_BASE + 'stt', { method: 'POST', body: fd }).then(function(r) { return r.json(); });
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
                    sttSetLoading(false);
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
                    sttSetLoading(false);
                });
        }
    });
});

// Check STT operation status
function checkOperationStatus(operationId) {
    function checkStatus() {
        fetch(API_BASE + 'operation?operationId=' + operationId)
            .then(response => response.json())
            .then(response => {
                if (response.done === "true") {
                    console.log('Operation completed successfully');

                    sttSetLoading(false);
                    sttMarkDone();
                    document.getElementById('sttResults').style.display = '';
                    
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
                        
                        const alt = chunk.alternatives[0];

                        // Inline time label
                        if (alt.startTimeMs !== undefined || alt.endTimeMs !== undefined) {
                            function fmtShort(ms) {
                                if (!ms) return '0:00';
                                var t = Math.floor(parseInt(ms) / 1000);
                                var m = Math.floor(t / 60);
                                var s = t % 60;
                                return m + ':' + (s < 10 ? '0' : '') + s;
                            }
                            var timeEl = document.createElement('div');
                            timeEl.className = 'bubble-time';
                            timeEl.textContent = fmtShort(alt.startTimeMs) + ' – ' + fmtShort(alt.endTimeMs);
                            bubble.appendChild(timeEl);
                        }

                        const content = document.createElement('div');
                        content.textContent = text;
                        bubble.appendChild(content);
                        
                        dialogueSection.appendChild(bubble);
                        
                        // Clearfix after each bubble
                        const clearfix = document.createElement('div');
                        clearfix.className = 'dialogue-clearfix';
                        dialogueSection.appendChild(clearfix);
                    });

                    // Build raw text view
                    (function() {
                        var rawLines = result
                            .filter(function(c) { return c.alternatives && c.alternatives[0] && c.alternatives[0].text; })
                            .map(function(c) { return c.alternatives[0].text.trim(); })
                            .filter(function(t) { return t; })
                            .join(' ');
                        document.getElementById('rawTextContent').textContent = rawLines;

                        function fmtMin(ms) {
                            var t = Math.floor(parseInt(ms || 0) / 1000);
                            var m = Math.floor(t / 60);
                            var s = t % 60;
                            return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
                        }
                        var firstMs = 0, lastMs = 0;
                        result.forEach(function(chunk) {
                            var alt = chunk.alternatives && chunk.alternatives[0];
                            if (!alt) return;
                            var startMs = parseInt(alt.startTimeMs || (alt.words && alt.words[0] && alt.words[0].start_time_ms) || 0) || 0;
                            var endMs   = parseInt(alt.endTimeMs   || (alt.words && alt.words.length && alt.words[alt.words.length - 1] && alt.words[alt.words.length - 1].end_time_ms) || 0) || 0;
                            if (!firstMs || startMs < firstMs) firstMs = startMs;
                            if (endMs > lastMs) lastMs = endMs;
                        });
                        document.getElementById('rawTextMeta').textContent = fmtMin(firstMs) + ' - ' + fmtMin(lastMs);
                    })();

                    // Helpers
                    function fmtSec(ms) {
                        if (ms == null) return '—';
                        var s = parseInt(ms) / 1000;
                        return s >= 60
                            ? Math.floor(s / 60) + ' мин ' + (s % 60).toFixed(0) + ' с'
                            : s.toFixed(1) + ' с';
                    }
                    function fmtPct(r) {
                        return r == null ? '—' : (parseFloat(r) * 100).toFixed(0) + '%';
                    }
                    function fmtMean(stat) {
                        return stat && stat.mean != null ? parseFloat(stat.mean).toFixed(1) : '—';
                    }
                    function statItem(label, value, sub) {
                        var el = document.createElement('div');
                        el.className = 'stat-item';
                        el.innerHTML = '<div class="stat-label">' + label + '</div>'
                            + '<div class="stat-value">' + value + '</div>'
                            + (sub ? '<div class="stat-sub">' + sub + '</div>' : '');
                        return el;
                    }

                    // Render Speaker Analysis
                    const speakerAnalysis = response.result.speakerAnalysis;
                    const speakerSection = document.getElementById('speakerAnalysisSection');
                    speakerSection.innerHTML = '';

                    if (speakerAnalysis && speakerAnalysis.length > 0) {
                        speakerAnalysis.forEach(function(sa) {
                            const card = document.createElement('div');
                            card.className = 'analysis-card';

                            const title = document.createElement('div');
                            title.className = 'stats-speaker-title';
                            title.textContent = 'Участник ' + (sa.speaker_tag || '?');
                            card.appendChild(title);

                            const grid = document.createElement('div');
                            grid.className = 'stats-grid';

                            grid.appendChild(statItem('Время речи', fmtSec(sa.total_speech_ms), fmtPct(sa.speech_ratio)));
                            grid.appendChild(statItem('Тишина', fmtSec(sa.total_silence_ms), fmtPct(sa.silence_ratio)));
                            grid.appendChild(statItem('Слов', sa.words_count || '0'));
                            grid.appendChild(statItem('Фраз', sa.utterance_count || '0'));
                            if (sa.words_per_second) grid.appendChild(statItem('Слов/сек', fmtMean(sa.words_per_second)));
                            if (sa.utterance_duration_estimation) grid.appendChild(statItem('Длина фразы', fmtSec(sa.utterance_duration_estimation.mean)));
                            if (sa.speech_boundaries) {
                                var start = fmtSec(sa.speech_boundaries.start_time_ms);
                                var end   = fmtSec(sa.speech_boundaries.end_time_ms);
                                grid.appendChild(statItem('Начало речи', start));
                                grid.appendChild(statItem('Конец речи', end));
                            }

                            card.appendChild(grid);
                            speakerSection.appendChild(card);
                        });
                    } else {
                        speakerSection.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:4px 0;">Нет данных</div>';
                    }

                    // Render Conversation Analysis
                    const convAnalysis = response.result.conversationAnalysis;
                    const convSection = document.getElementById('conversationAnalysisSection');
                    convSection.innerHTML = '';

                    if (convAnalysis) {
                        const card = document.createElement('div');
                        card.className = 'analysis-card';

                        const grid = document.createElement('div');
                        grid.className = 'stats-grid';

                        if (convAnalysis.conversation_boundaries) {
                            grid.appendChild(statItem('Длительность',
                                fmtSec((convAnalysis.conversation_boundaries.end_time_ms || 0) - (convAnalysis.conversation_boundaries.start_time_ms || 0))));
                        }
                        grid.appendChild(statItem('Речь', fmtSec(convAnalysis.total_speech_duration_ms), fmtPct(convAnalysis.total_speech_ratio)));
                        grid.appendChild(statItem('Одновременная речь', fmtSec(convAnalysis.total_simultaneous_speech_duration_ms), fmtPct(convAnalysis.total_simultaneous_speech_ratio)));
                        grid.appendChild(statItem('Тишина', fmtSec(convAnalysis.total_simultaneous_silence_duration_ms), fmtPct(convAnalysis.total_simultaneous_silence_ratio)));

                        card.appendChild(grid);

                        if (convAnalysis.speaker_interrupts && convAnalysis.speaker_interrupts.length > 0) {
                            const intWrap = document.createElement('div');
                            intWrap.className = 'stats-interrupts';
                            convAnalysis.speaker_interrupts.forEach(function(si) {
                                var line = document.createElement('div');
                                line.style.marginTop = '8px';
                                line.innerHTML = '<span style="color:var(--text);font-weight:600;">Перебивания — участник ' + (si.speaker_tag || '?') + ':</span>'
                                    + ' ' + (si.interrupts_count || 0) + ' раз, '
                                    + fmtSec(si.interrupts_duration_ms);
                                if (si.interrupts && si.interrupts.length > 0) {
                                    var chips = document.createElement('div');
                                    chips.className = 'interrupts-list';
                                    chips.style.marginTop = '4px';
                                    si.interrupts.forEach(function(seg) {
                                        var span = document.createElement('span');
                                        span.className = 'interrupt-item';
                                        span.textContent = fmtSec(seg.start_time_ms) + ' → ' + fmtSec(seg.end_time_ms);
                                        chips.appendChild(span);
                                    });
                                    line.appendChild(chips);
                                }
                                intWrap.appendChild(line);
                            });
                            card.appendChild(intWrap);
                        }

                        convSection.appendChild(card);
                    } else {
                        convSection.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:4px 0;">Нет данных</div>';
                    }

                    // Show stats section if any data
                    if ((speakerAnalysis && speakerAnalysis.length > 0) || convAnalysis) {
                        document.getElementById('statsSection').style.display = 'block';
                        document.getElementById('toggleStatsBtn').querySelector('.collapse-arrow').classList.add('open');
                    }

                    // Render Summarization
                    const summaryData = response.result.summarization;
                    const summarySection = document.getElementById('summarySection');
                    summarySection.innerHTML = '';
                    
                    var classifiersOn = document.getElementById('classifiersToggleTrack').classList.contains('active');
                    var requestedClassifiers = classifiersOn && selectedClassifiers.size > 0 ? Array.from(selectedClassifiers) : [];
                    renderSttClassifiers(response.result.classifierData, requestedClassifiers);

                    if (summaryData && summaryData.results && summaryData.results.length > 0) {
                        document.getElementById('llmResultSection').style.display = '';
                        const card = document.createElement('div');
                        card.className = 'analysis-card';
                        
                        summaryData.results.forEach(function(item) {
                            var responseText = item.response || '';
                            
                            // Strip markdown code fences if present (e.g. ```json ... ```)
                            var fenceStart = new RegExp('^' + '`'.repeat(3) + '(?:json)?\\s*\\n?');
                            var fenceEnd = new RegExp('\\n?' + '`'.repeat(3) + '\\s*$');
                            responseText = responseText.replace(fenceStart, '').replace(fenceEnd, '').trim();
                            
                            // Try to parse as JSON and render structured
                            try {
                                var parsed = JSON.parse(responseText);
                                if (typeof parsed === 'object' && parsed !== null) {
                                    renderLlmJson(parsed, card);
                                } else {
                                    throw new Error('not an object');
                                }
                            } catch (e) {
                                // Not valid JSON — display as plain text
                                const p = document.createElement('p');
                                p.className = 'llm-text';
                                p.style.margin = '0';
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
                    }
                } else {
                    setTimeout(checkStatus, 5000);
                }
            })
            .catch(error => {
                console.error('Error checking operation status:', error);
                sttSetLoading(false);
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
let websocket;
let audioContext;
let isRecording = false;
let mediaStream;
let streamTimerInterval = null;
let streamStartTime = 0;

// SpeechKit streaming session hard limit: 5 minutes of audio.
const STREAM_MAX_SECONDS = 5 * 60;

function setupStreamRecognition() {
    document.getElementById('eouPauseSlider').addEventListener('input', function() {
        document.getElementById('eouPauseValue').textContent = this.value + ' мс';
    });

    // Language custom dropdown (same look as the STT tab)
    buildStreamLangDropdown();
    updateStreamClassifierAvailability();

    // Normalization sub-options are only meaningful when normalization is on.
    document.getElementById('streamNormalizationToggle').addEventListener('change', updateStreamNormalizationSubOptions);
    updateStreamNormalizationSubOptions();

    // Classifier multiselect (mirrors the STT async tab)
    buildStreamClassifierMultiselect();
    document.getElementById('streamClassifiersToggleTrack').closest('.raw-text-toggle-label').addEventListener('click', function() {
        var track = document.getElementById('streamClassifiersToggleTrack');
        if (track.classList.contains('disabled')) return;
        var on = track.classList.toggle('active');
        document.getElementById('streamClassifiersOptions').style.display = on ? '' : 'none';
        if (on && selectedStreamClassifiers.size === 0) {
            // Default to all selected — preserves the previous "classifiers=all" behaviour.
            selectAllStreamClassifiers();
        } else if (!on) {
            document.getElementById('streamClassifierMultiselectDropdown').style.display = 'none';
        }
    });
    document.getElementById('streamClassifierMultiselectBtn').addEventListener('click', function() {
        var dd = document.getElementById('streamClassifierMultiselectDropdown');
        dd.style.display = dd.style.display === 'none' ? '' : 'none';
    });

    // Reset streaming recognition parameters to their defaults
    document.getElementById('resetStreamParamsBtn').addEventListener('click', function() {
        // Language
        currentStreamLang = 'ru-RU';
        document.getElementById('streamLangDropdown').textContent = 'Русский';
        document.getElementById('streamLangDropdownContent').classList.remove('show');

        // Text normalization (on by default)
        document.getElementById('streamNormalizationToggle').checked = true;
        document.getElementById('streamProfanityFilterToggle').checked = false;
        document.getElementById('streamLiteraryTextToggle').checked = false;
        updateStreamNormalizationSubOptions();

        // End-of-utterance pause
        document.getElementById('eouPauseSlider').value = '500';
        document.getElementById('eouPauseValue').textContent = '500 мс';

        // Classifiers — off + cleared
        var cTrack = document.getElementById('streamClassifiersToggleTrack');
        cTrack.classList.remove('active');
        document.getElementById('streamClassifiersOptions').style.display = 'none';
        document.getElementById('streamClassifierMultiselectDropdown').style.display = 'none';
        selectedStreamClassifiers = new Set();
        updateStreamClassifierBtnText();
        document.querySelectorAll('#streamClassifierMultiselectDropdown .classifier-multiselect-item').forEach(function(item) {
            item.classList.remove('selected');
        });

        // Re-apply ru-RU availability (re-enables classifier toggle)
        updateStreamClassifierAvailability();
    });

    document.getElementById('startStreamBtn').addEventListener('click', startStreaming);
    document.getElementById('stopStreamBtn').addEventListener('click', stopStreaming);
    document.getElementById('clearStreamBtn').addEventListener('click', function() {
        document.getElementById('partialText').textContent = '';
        document.getElementById('finalText').innerHTML = '';
        document.getElementById('streamSummarySection').innerHTML = '';
    });
}

var streamLangOptions = [
    { label: 'Русский',     value: 'ru-RU' },
    { label: 'Английский',  value: 'en-US' },
    { label: 'Казахский',   value: 'kk-KZ' },
    { label: 'Турецкий',    value: 'tr-TR' },
    { label: 'Узбекский',   value: 'uz-UZ' },
    { label: 'Немецкий',    value: 'de-DE' },
    { label: 'Испанский',   value: 'es-ES' },
    { label: 'Французский', value: 'fr-FR' },
    { label: 'Итальянский', value: 'it-IT' },
    { label: 'Польский',    value: 'pl-PL' },
];

// Build the stream language custom dropdown (same component as the STT tab).
function buildStreamLangDropdown() {
    var btn = document.getElementById('streamLangDropdown');
    var content = document.getElementById('streamLangDropdownContent');
    if (!btn || !content || content.dataset.built) return;
    content.dataset.built = '1';

    btn.addEventListener('click', function() {
        content.classList.toggle('show');
    });

    streamLangOptions.forEach(function(opt) {
        var item = document.createElement('a');
        item.textContent = opt.label;
        item.onclick = function() {
            currentStreamLang = opt.value;
            btn.textContent = opt.label;
            content.classList.remove('show');
            updateStreamClassifierAvailability();
        };
        content.appendChild(item);
    });
}

// Enable the classifiers toggle only for ru-RU; switch it off + disable it otherwise.
function updateStreamClassifierAvailability() {
    const lang = currentStreamLang;
    const track = document.getElementById('streamClassifiersToggleTrack');
    const isRu = lang === 'ru-RU';
    track.classList.toggle('disabled', !isRu);
    if (!isRu) {
        track.classList.remove('active');
        document.getElementById('streamClassifiersOptions').style.display = 'none';
        var dd = document.getElementById('streamClassifierMultiselectDropdown');
        if (dd) dd.style.display = 'none';
    }
}

// Build the stream classifier multiselect items once (same markup as STT async).
function buildStreamClassifierMultiselect() {
    var dropdown = document.getElementById('streamClassifierMultiselectDropdown');
    if (!dropdown || dropdown.dataset.built) return;
    dropdown.dataset.built = '1';

    var selectAllBtn = document.createElement('div');
    selectAllBtn.className = 'classifier-select-all';
    selectAllBtn.textContent = 'Выбрать все';
    selectAllBtn.addEventListener('click', selectAllStreamClassifiers);
    dropdown.appendChild(selectAllBtn);

    STT_CLASSIFIERS.forEach(function(clf) {
        var item = document.createElement('div');
        item.className = 'classifier-multiselect-item';
        item.dataset.id = clf.id;

        var check = document.createElement('span');
        check.className = 'classifier-multiselect-check';
        check.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        item.appendChild(check);

        var label = document.createElement('span');
        label.className = 'classifier-multiselect-label';
        label.textContent = clf.label;
        item.appendChild(label);

        var help = document.createElement('a');
        help.className = 'help-link classifier-item-help';
        help.innerHTML = '?<span class="help-tooltip">' + clf.tooltip + '</span>';
        item.appendChild(help);

        item.addEventListener('click', function(e) {
            if (e.target.closest('.help-link')) return;
            if (selectedStreamClassifiers.has(clf.id)) {
                selectedStreamClassifiers.delete(clf.id);
                item.classList.remove('selected');
            } else {
                selectedStreamClassifiers.add(clf.id);
                item.classList.add('selected');
            }
            updateStreamClassifierBtnText();
        });

        dropdown.appendChild(item);
    });
}

function selectAllStreamClassifiers() {
    var dropdown = document.getElementById('streamClassifierMultiselectDropdown');
    STT_CLASSIFIERS.forEach(function(c) { selectedStreamClassifiers.add(c.id); });
    if (dropdown) {
        dropdown.querySelectorAll('.classifier-multiselect-item').forEach(function(el) {
            el.classList.add('selected');
        });
    }
    updateStreamClassifierBtnText();
}

function updateStreamClassifierBtnText() {
    var label = document.getElementById('streamClassifierMultiselectLabel');
    if (!label) return;
    var n = selectedStreamClassifiers.size;
    var total = STT_CLASSIFIERS.length;
    if (n === 0) label.textContent = 'Выберите классификаторы';
    else if (n === total) label.textContent = 'Все классификаторы';
    else label.textContent = n + ' из ' + total + ' выбрано';
}

// Profanity filter / literary text apply only when normalization is enabled.
function updateStreamNormalizationSubOptions() {
    const enabled = document.getElementById('streamNormalizationToggle').checked;
    const profanity = document.getElementById('streamProfanityFilterToggle');
    const literary = document.getElementById('streamLiteraryTextToggle');
    profanity.disabled = !enabled;
    literary.disabled = !enabled;
    if (!enabled) {
        profanity.checked = false;
        literary.checked = false;
    }
}

// Format seconds as MM:SS.
function formatStreamTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function startStreamTimer() {
    streamStartTime = Date.now();
    const indicator = document.getElementById('streamRecIndicator');
    const timerEl = document.getElementById('streamRecTimer');
    indicator.classList.remove('near-limit');
    timerEl.textContent = '00:00';
    indicator.style.display = '';

    streamTimerInterval = setInterval(function() {
        const elapsed = Math.floor((Date.now() - streamStartTime) / 1000);
        timerEl.textContent = formatStreamTime(elapsed);
        // Warn in the last 30 seconds before the hard limit.
        if (elapsed >= STREAM_MAX_SECONDS - 30) {
            indicator.classList.add('near-limit');
        }
        if (elapsed >= STREAM_MAX_SECONDS) {
            document.getElementById('partialText').textContent = 'Достигнут лимит сессии (5 минут) — запись остановлена.';
            stopStreaming();
        }
    }, 1000);
}

function stopStreamTimer() {
    if (streamTimerInterval) {
        clearInterval(streamTimerInterval);
        streamTimerInterval = null;
    }
    const indicator = document.getElementById('streamRecIndicator');
    if (indicator) indicator.style.display = 'none';
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
        
        const lang = currentStreamLang;

        // Clear previous summary
        document.getElementById('streamSummarySection').innerHTML = '';

        // Create WebSocket connection — derive ws(s):// URL from API_BASE so
        // the path prefix is preserved when running behind a reverse proxy.
        let wsUrl = API_BASE.replace(/^http/, 'ws') + 'stream?lang=' + lang;
        var streamLlmOn = document.getElementById('streamLlmToggleTrack').classList.contains('active');
        if (streamLlmOn) {
            var streamSummaryInstruction = document.getElementById('streamSummaryInstructionInput').value;
            if (streamSummaryInstruction) {
                wsUrl += '&summaryInstruction=' + encodeURIComponent(streamSummaryInstruction);
            }
            wsUrl += '&llmModel=' + encodeURIComponent(currentStreamLlmModel);
        }
        const classifiersEnabled = document.getElementById('streamClassifiersToggleTrack').classList.contains('active');
        if (classifiersEnabled && selectedStreamClassifiers.size > 0) {
            const list = Array.from(selectedStreamClassifiers);
            wsUrl += '&classifiers=' + (list.length === STT_CLASSIFIERS.length ? 'all' : list.join(','));
        }
        const eouPause = document.getElementById('eouPauseSlider').value;
        if (eouPause !== '500') {
            wsUrl += '&eouPause=' + eouPause;
        }

        // Text normalization options
        const normEnabled = document.getElementById('streamNormalizationToggle').checked;
        wsUrl += '&normalization=' + (normEnabled ? 'true' : 'false');
        if (normEnabled) {
            if (document.getElementById('streamProfanityFilterToggle').checked) {
                wsUrl += '&profanityFilter=true';
            }
            if (document.getElementById('streamLiteraryTextToggle').checked) {
                wsUrl += '&literaryText=true';
            }
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
            startStreamTimer();
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
    stopStreamTimer();

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

function sttSetLoading(loading) {
    var btn = document.getElementById('sendButtonStt');
    if (loading) {
        btn.classList.add('loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

function formatModelName(id) {
    // id format: gpt://folder_id/model_name  or  gpt://folder_id/model_name/version
    var parts = id.split('/');
    if (parts.length < 4) return id;
    var name = parts[3];
    var ver  = parts[4] || '';
    return ver ? name + ' (' + ver + ')' : name;
}

function loadLlmModels(btnId, contentId, onSelect) {
    var btn     = document.getElementById(btnId);
    var content = document.getElementById(contentId);
    btn.textContent = 'Загрузка моделей…';
    content.innerHTML = '';

    fetch(API_BASE + 'models')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.error) throw new Error(data.error);
            var models = (data.data || []).filter(function(m) {
                return m.id && m.id.startsWith('gpt://') && !m.id.includes('/deprecated');
            });
            if (!models.length) { btn.textContent = 'Нет моделей'; return; }

            // Auto-select first model
            var firstLabel = formatModelName(models[0].id);
            btn.textContent = firstLabel;
            onSelect(models[0].id);

            models.forEach(function(m) {
                var label = formatModelName(m.id);
                var item  = document.createElement('a');
                item.textContent = label;
                item.onclick = function() {
                    btn.textContent = label;
                    content.classList.remove('show');
                    onSelect(m.id);
                };
                content.appendChild(item);
            });
        })
        .catch(function(err) {
            console.error('Failed to load models:', err);
            btn.textContent = 'Ошибка загрузки';
        });
}

function getSttCurrentParams() {
    var file = document.getElementById('fileInput').files[0];
    var llmOn = document.getElementById('llmToggleTrack').classList.contains('active');
    return {
        lang:               currentSttLang,
        normalization:      document.getElementById('normalizationToggle').checked,
        profanityFilter:    document.getElementById('profanityFilterToggle').checked,
        literaryText:       document.getElementById('literaryTextToggle').checked,
        speakerLabeling:    document.getElementById('speakerLabelingToggle').checked,
        speakerGrouping:    document.getElementById('speakerGroupingToggle').checked,
        classifiers:        document.getElementById('classifiersToggleTrack').classList.contains('active')
                                ? Array.from(selectedClassifiers).sort().join(',') : '',
        llmEnabled:         llmOn,
        llmModel:           llmOn ? currentLlmModel : '',
        summaryInstruction: llmOn ? (document.getElementById('summaryInstructionInput').value || '').trim() : '',
        fileId:             sttExampleKey || (file ? file.name + ':' + file.size : null),
    };
}

function sttMarkDone() {
    sttLastParams = getSttCurrentParams();
    document.getElementById('sendButtonStt').disabled = true;
}

function sttCheckDirty() {
    if (!sttLastParams) return;
    var dirty = JSON.stringify(getSttCurrentParams()) !== JSON.stringify(sttLastParams);
    document.getElementById('sendButtonStt').disabled = !dirty;
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2).replace('.', ',') + ' КБ';
    return (bytes / (1024 * 1024)).toFixed(2).replace('.', ',') + ' МБ';
}

function showSttFileChip(name, size) {
    document.getElementById('sttFileChipName').textContent = name;
    var sizeEl = document.getElementById('sttFileChipSize');
    sizeEl.textContent = size ? formatFileSize(size) : '';
    // toggle separators visibility based on whether size is present
    var seps = document.querySelectorAll('#sttFileChip .stt-file-chip-sep');
    if (seps[1]) seps[1].style.display = size ? '' : 'none';
    document.getElementById('sttFileChip').style.display = 'flex';
    document.getElementById('sttUploadZone').style.display = 'none';
}

function hideSttFileChip() {
    document.getElementById('sttFileChip').style.display = 'none';
    document.getElementById('sttUploadZone').style.display = '';
}

// STT tab — new UI setup
document.addEventListener('DOMContentLoaded', function() {
    var sttLangOptions = [
        { label: 'Русский',             value: 'ru-RU' },
        { label: 'Автоматически',       value: 'auto'  },
        { label: 'Английский',          value: 'en-US' },
        { label: 'Немецкий',            value: 'de-DE' },
        { label: 'Испанский',           value: 'es-ES' },
        { label: 'Французский',         value: 'fr-FR' },
        { label: 'Итальянский',         value: 'it-IT' },
        { label: 'Казахский',           value: 'kk-KZ' },
        { label: 'Турецкий',            value: 'tr-TR' },
        { label: 'Узбекский',           value: 'uz-UZ' },
        { label: 'Польский',            value: 'pl-PL' },
        { label: 'Португальский',           value: 'pt-PT' },
        { label: 'Португальский (Бразилия)', value: 'pt-BR' },
        { label: 'Нидерландский',       value: 'nl-NL' },
        { label: 'Финский',             value: 'fi-FI' },
        { label: 'Шведский',            value: 'sv-SE' },
        { label: 'Иврит',               value: 'he-IL' },
    ];

    var sttLangBtn = document.getElementById('sttLangDropdown');
    var sttLangContent = document.getElementById('sttLangDropdownContent');

    sttLangBtn.addEventListener('click', function() {
        sttLangContent.classList.toggle('show');
    });

    sttLangOptions.forEach(function(opt) {
        var item = document.createElement('a');
        item.textContent = opt.label;
        item.onclick = function() {
            currentSttLang = opt.value;
            sttLangBtn.textContent = opt.label;
            sttLangContent.classList.remove('show');
            sttCheckDirty();
            // Disable normalization for auto-detect (normalization not supported with auto)
            var normToggle = document.getElementById('normalizationToggle');
            var classifiersTrack = document.getElementById('classifiersToggleTrack');
            if (opt.value === 'auto') {
                normToggle.checked = false;
                normToggle.disabled = true;
                document.getElementById('profanityFilterToggle').disabled = true;
                document.getElementById('profanityFilterToggle').checked = false;
                document.getElementById('literaryTextToggle').disabled = true;
                document.getElementById('literaryTextToggle').checked = false;
                classifiersTrack.classList.add('disabled');
                if (classifiersTrack.classList.contains('active')) {
                    classifiersTrack.classList.remove('active');
                    document.getElementById('classifiersOptions').style.display = 'none';
                }
            } else if (opt.value !== 'ru-RU') {
                normToggle.disabled = false;
                var normEnabled = normToggle.checked;
                document.getElementById('profanityFilterToggle').disabled = !normEnabled;
                document.getElementById('literaryTextToggle').disabled = !normEnabled;
                classifiersTrack.classList.add('disabled');
                if (classifiersTrack.classList.contains('active')) {
                    classifiersTrack.classList.remove('active');
                    document.getElementById('classifiersOptions').style.display = 'none';
                }
            } else {
                normToggle.disabled = false;
                var normEnabled = normToggle.checked;
                document.getElementById('profanityFilterToggle').disabled = !normEnabled;
                document.getElementById('literaryTextToggle').disabled = !normEnabled;
                classifiersTrack.classList.remove('disabled');
            }
        };
        sttLangContent.appendChild(item);
    });

    // Normalization toggle controls sub-checkboxes
    document.getElementById('normalizationToggle').addEventListener('change', function() {
        var enabled = this.checked;
        document.getElementById('profanityFilterToggle').disabled = !enabled;
        document.getElementById('literaryTextToggle').disabled = !enabled;
        if (!enabled) {
            document.getElementById('profanityFilterToggle').checked = false;
            document.getElementById('literaryTextToggle').checked = false;
        }
        sttCheckDirty();
    });

    document.getElementById('profanityFilterToggle').addEventListener('change', sttCheckDirty);
    document.getElementById('literaryTextToggle').addEventListener('change', sttCheckDirty);

    // Speaker labeling toggle controls grouping sub-checkbox
    document.getElementById('speakerLabelingToggle').addEventListener('change', function() {
        var enabled = this.checked;
        document.getElementById('speakerGroupingToggle').disabled = !enabled;
        if (!enabled) {
            document.getElementById('speakerGroupingToggle').checked = false;
        }
        sttCheckDirty();
    });

    document.getElementById('speakerGroupingToggle').addEventListener('change', sttCheckDirty);

    // Classifier toggle
    document.getElementById('classifiersToggleTrack').closest('.raw-text-toggle-label').addEventListener('click', function() {
        var track = document.getElementById('classifiersToggleTrack');
        if (track.classList.contains('disabled')) return;
        var active = track.classList.toggle('active');
        document.getElementById('classifiersOptions').style.display = active ? '' : 'none';
        if (active && selectedClassifiers.size === 0) {
            // Select all classifiers by default on first enable.
            STT_CLASSIFIERS.forEach(function(c) { selectedClassifiers.add(c.id); });
            document.getElementById('classifierMultiselectDropdown')
                .querySelectorAll('.classifier-multiselect-item')
                .forEach(function(el) { el.classList.add('selected'); });
            updateClassifierBtnText();
        } else if (!active) {
            document.getElementById('classifierMultiselectDropdown').style.display = 'none';
        }
        sttCheckDirty();
    });

    // Build classifier multiselect items
    (function() {
        var dropdown = document.getElementById('classifierMultiselectDropdown');

        // "Select all" button
        var selectAllBtn = document.createElement('div');
        selectAllBtn.className = 'classifier-select-all';
        selectAllBtn.textContent = 'Выбрать все';
        selectAllBtn.addEventListener('click', function() {
            STT_CLASSIFIERS.forEach(function(c) { selectedClassifiers.add(c.id); });
            dropdown.querySelectorAll('.classifier-multiselect-item').forEach(function(el) {
                el.classList.add('selected');
            });
            updateClassifierBtnText();
            sttCheckDirty();
        });
        dropdown.appendChild(selectAllBtn);

        STT_CLASSIFIERS.forEach(function(clf) {
            var item = document.createElement('div');
            item.className = 'classifier-multiselect-item'; // not selected by default
            item.dataset.id = clf.id;

            var check = document.createElement('span');
            check.className = 'classifier-multiselect-check';
            check.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            item.appendChild(check);

            var label = document.createElement('span');
            label.className = 'classifier-multiselect-label';
            label.textContent = clf.label;
            item.appendChild(label);

            var help = document.createElement('a');
            help.className = 'help-link classifier-item-help';
            help.innerHTML = '?<span class="help-tooltip">' + clf.tooltip + '</span>';
            item.appendChild(help);

            item.addEventListener('click', function(e) {
                if (e.target.closest('.help-link')) return;
                if (selectedClassifiers.has(clf.id)) {
                    selectedClassifiers.delete(clf.id);
                    item.classList.remove('selected');
                } else {
                    selectedClassifiers.add(clf.id);
                    item.classList.add('selected');
                }
                updateClassifierBtnText();
                sttCheckDirty();
            });

            dropdown.appendChild(item);
        });
    })();

    // Classifier multiselect button
    document.getElementById('classifierMultiselectBtn').addEventListener('click', function() {
        var dd = document.getElementById('classifierMultiselectDropdown');
        dd.style.display = dd.style.display === 'none' ? '' : 'none';
    });

    // LLM model dropdown toggle (STT)
    document.getElementById('llmModelDropdown').addEventListener('click', function() {
        document.getElementById('llmModelDropdownContent').classList.toggle('show');
    });

    // LLM toggle (STT)
    var llmModelsLoaded = false;
    document.getElementById('llmToggleTrack').closest('.raw-text-toggle-label').addEventListener('click', function() {
        var track = document.getElementById('llmToggleTrack');
        var active = track.classList.toggle('active');
        document.getElementById('llmOptions').style.display = active ? '' : 'none';
        if (active && !llmModelsLoaded) {
            llmModelsLoaded = true;
            loadLlmModels('llmModelDropdown', 'llmModelDropdownContent', function(v) {
                currentLlmModel = v; sttCheckDirty();
            });
        }
        sttCheckDirty();
    });

    document.getElementById('summaryInstructionInput').addEventListener('input', sttCheckDirty);

    var LLM_PRESETS = {
        summarization: 'Проанализируй текст, полученный из аудиозаписи, и составь краткое, точное и структурированное резюме. Сохрани ключевые идеи, основные факты, важные имена, даты и выводы. Избегай лишних деталей и повторов.\nЕсли в тексте присутствуют разные темы или разделы — выдели их логически (например, с помощью маркированного списка или кратких подзаголовков).\nУкажи общий контекст (например: встреча, лекция, интервью, разговор), если он понятен из текста.\nЕсли в тексте есть неясности, пропуски или шум (например, «неразборчиво», «[пауза]»), проигнорируй их или учти при формулировке, не искажая смысл.\nОбъём резюме — не более 20% от исходного текста, при этом смысл исходного текста должен полностью сохраниться.',
        translation:   'Ты — профессиональный переводчик. Переведи текст на английский язык c сохранением стиля общения. Перевод должен быть максимально точным и полным.\nЕсли в тексте есть неясности, пропуски или шум (например, «неразборчиво», «[пауза]»), проигнорируй их или учти при формулировке, не искажая смысл.',
        keyphrases:    'Выдели ключевые фразы текста, полученного из аудиозаписи.\nЕсли в тексте есть неясности, пропуски или шум (например, «неразборчиво», «[пауза]»), проигнорируй их или учти при формулировке, не искажая смысл.',
        evaluation:    'Проанализируй текст, полученный из аудиозаписи, по следующим критериям: структура диалога, качество коммуникации, грамотность речи, достижение цели, тон общения, наличие конфликтных моментов.\nОцени диалог от 1 до 10, выдели сильные и слабые стороны. Дай рекомендации по улучшению коммуникации.',
    };

    document.querySelectorAll('[data-llm-preset]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var textarea = document.getElementById('summaryInstructionInput');
            textarea.value = LLM_PRESETS[this.dataset.llmPreset] || '';
            sttCheckDirty();
        });
    });

    // LLM instruction presets (stream) — reuse the same LLM_PRESETS
    document.querySelectorAll('[data-stream-llm-preset]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.getElementById('streamSummaryInstructionInput').value =
                LLM_PRESETS[this.dataset.streamLlmPreset] || '';
        });
    });

    // LLM model dropdown toggle (stream)
    document.getElementById('streamLlmModelDropdown').addEventListener('click', function() {
        document.getElementById('streamLlmModelDropdownContent').classList.toggle('show');
    });

    // LLM toggle (stream)
    var streamLlmModelsLoaded = false;
    document.getElementById('streamLlmToggleTrack').closest('.raw-text-toggle-label').addEventListener('click', function() {
        var track = document.getElementById('streamLlmToggleTrack');
        var active = track.classList.toggle('active');
        document.getElementById('streamLlmOptions').style.display = active ? '' : 'none';
        document.getElementById('streamLlmResultWrapper').style.display = active ? '' : 'none';
        if (active && !streamLlmModelsLoaded) {
            streamLlmModelsLoaded = true;
            loadLlmModels('streamLlmModelDropdown', 'streamLlmModelDropdownContent', function(v) {
                currentStreamLlmModel = v;
            });
        }
    });

    // Choose file button
    document.getElementById('sttChooseFileBtn').addEventListener('click', function() {
        document.getElementById('fileInput').click();
    });

    // Reset STT params to defaults
    document.getElementById('resetSttParamsBtn').addEventListener('click', function() {
        currentSttLang = 'ru-RU';
        document.getElementById('sttLangDropdown').textContent = 'Русский';

        var normEl = document.getElementById('normalizationToggle');
        normEl.checked = true;
        normEl.disabled = false;
        document.getElementById('profanityFilterToggle').checked = false;
        document.getElementById('profanityFilterToggle').disabled = false;
        document.getElementById('literaryTextToggle').checked = false;
        document.getElementById('literaryTextToggle').disabled = false;

        document.getElementById('speakerLabelingToggle').checked = false;
        document.getElementById('speakerGroupingToggle').checked = false;
        document.getElementById('speakerGroupingToggle').disabled = true;

        var cTrack = document.getElementById('classifiersToggleTrack');
        cTrack.classList.remove('active', 'disabled');
        document.getElementById('classifiersOptions').style.display = 'none';
        document.getElementById('classifierMultiselectDropdown').style.display = 'none';
        selectedClassifiers = new Set();
        updateClassifierBtnText();
        document.querySelectorAll('.classifier-multiselect-item').forEach(function(item) {
            item.classList.remove('selected');
        });

        sttCheckDirty();
    });

    // Raw text toggle
    document.getElementById('rawTextToggleLabel').addEventListener('click', function() {
        var track = document.getElementById('rawTextToggleTrack');
        var active = track.classList.toggle('active');
        document.getElementById('dialogueSection').style.display  = active ? 'none' : '';
        document.getElementById('rawTextSection').style.display   = active ? ''     : 'none';
    });

    // Copy dialogue / raw text
    document.getElementById('copyDialogueBtn').addEventListener('click', function() {
        var isRaw = document.getElementById('rawTextToggleTrack').classList.contains('active');
        var text;
        if (isRaw) {
            text = document.getElementById('rawTextContent').textContent;
        } else {
            text = Array.from(document.querySelectorAll('#dialogueSection .dialogue-bubble'))
                .map(function(b) { var d = b.querySelector('div'); return d ? d.textContent : b.textContent; })
                .join('\n');
        }
        var btn = this;
        navigator.clipboard.writeText(text).then(function() {
            var orig = btn.innerHTML;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg> Скопировано';
            btn.classList.add('copied');
            setTimeout(function() { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1800);
        });
    });

    // Remove file chip
    document.getElementById('sttFileRemoveBtn').addEventListener('click', function() {
        document.getElementById('fileInput').value = '';
        sttExampleKey = null;
        hideSttFileChip();
        document.getElementById('rateForm').classList.add('hidden');
        document.getElementById('sampleRateInput').value = '48000';
        document.getElementById('sttExampleMono').classList.remove('btn-success');
        document.getElementById('sttExampleMono').classList.add('btn-secondary');
        document.getElementById('sttExampleStereo').classList.remove('btn-success');
        document.getElementById('sttExampleStereo').classList.add('btn-secondary');
        sttCheckDirty();
    });

    // Drag and drop on upload zone
    var uploadZone = document.getElementById('sttUploadZone');

    uploadZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('dragover');
        var files = e.dataTransfer.files;
        if (files.length > 0) {
            var fileInput = document.getElementById('fileInput');
            // DataTransfer is the only way to programmatically set files
            var dt = new DataTransfer();
            dt.items.add(files[0]);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
});

function updateClassifierBtnText() {
    var label = document.getElementById('classifierMultiselectLabel');
    if (!label) return;
    var n = selectedClassifiers.size;
    var total = STT_CLASSIFIERS.length;
    if (n === 0) label.textContent = 'Выберите классификаторы';
    else if (n === total) label.textContent = 'Все классификаторы';
    else label.textContent = n + ' из ' + total + ' выбрано';
}

function renderLlmJson(parsed, container) {
    function makeList(items, cls) {
        var ul = document.createElement('ul');
        ul.className = 'llm-list' + (cls ? ' ' + cls : '');
        items.forEach(function(item) {
            var li = document.createElement('li');
            li.textContent = typeof item === 'string' ? item : JSON.stringify(item);
            ul.appendChild(li);
        });
        return ul;
    }

    Object.keys(parsed).forEach(function(key) {
        var val = parsed[key];
        var block = document.createElement('div');
        block.className = 'llm-block';

        if (typeof val === 'number') {
            // Top-level score
            block.classList.add('llm-block-score');
            var scoreLbl = document.createElement('span');
            scoreLbl.className = 'llm-score-label';
            scoreLbl.textContent = key;
            var scoreVal = document.createElement('span');
            scoreVal.className = 'llm-score-value';
            scoreVal.textContent = val + ' / 10';
            block.appendChild(scoreLbl);
            block.appendChild(scoreVal);
        } else {
            var heading = document.createElement('div');
            heading.className = 'llm-block-heading';
            heading.textContent = key.charAt(0).toUpperCase() + key.slice(1);
            block.appendChild(heading);

            if (typeof val === 'string') {
                var p = document.createElement('p');
                p.className = 'llm-text';
                p.textContent = val;
                block.appendChild(p);
            } else if (Array.isArray(val)) {
                block.appendChild(makeList(val, ''));
            } else if (typeof val === 'object' && val !== null) {
                var sub = document.createElement('div');
                sub.className = 'llm-subsection';
                Object.keys(val).forEach(function(subKey) {
                    var subVal = val[subKey];
                    var subBlock = document.createElement('div');
                    subBlock.className = 'llm-sub-block';
                    var subLabel = document.createElement('div');
                    subLabel.className = 'llm-sub-label';
                    subLabel.textContent = subKey;
                    subBlock.appendChild(subLabel);
                    if (typeof subVal === 'string') {
                        var sp = document.createElement('p');
                        sp.className = 'llm-text';
                        sp.textContent = subVal;
                        subBlock.appendChild(sp);
                    } else if (Array.isArray(subVal)) {
                        var cls = subKey === 'сильные стороны' ? 'llm-list-pos'
                                : subKey === 'слабые стороны'  ? 'llm-list-neg' : '';
                        subBlock.appendChild(makeList(subVal, cls));
                    } else if (typeof subVal === 'number') {
                        var sc = document.createElement('span');
                        sc.className = 'llm-score-value';
                        sc.textContent = subVal + ' / 10';
                        subBlock.appendChild(sc);
                    }
                    sub.appendChild(subBlock);
                });
                block.appendChild(sub);
            }
        }
        container.appendChild(block);
    });
}

function renderSttClassifiers(classifierData, requestedList) {
    var section = document.getElementById('classifierResultSection');
    var content = document.getElementById('classifierResultContent');
    content.innerHTML = '';

    if (!requestedList || !requestedList.length) {
        section.style.display = 'none';
        return;
    }

    // Compute average confidence per classifier per label across all utterances
    var sums = {}, counts = {};
    (classifierData || []).forEach(function(cu) {
        var name = cu.classifier;
        if (!name) return;
        if (!sums[name]) { sums[name] = {}; counts[name] = 0; }
        counts[name]++;
        (cu.labels || []).forEach(function(lbl) {
            if (!sums[name][lbl.label]) sums[name][lbl.label] = 0;
            sums[name][lbl.label] += (lbl.confidence || 0);
        });
    });
    var byClassifier = {};
    Object.keys(sums).forEach(function(name) {
        byClassifier[name] = {};
        var n = counts[name] || 1;
        Object.keys(sums[name]).forEach(function(lbl) {
            byClassifier[name][lbl] = sums[name][lbl] / n;
        });
    });

    var namesRu = {
        'formal_greeting':   'Формальное приветствие',
        'informal_greeting': 'Неформальное приветствие',
        'formal_farewell':   'Формальное прощание',
        'informal_farewell': 'Неформальное прощание',
        'insult':            'Оскорбления',
        'profanity':         'Мат',
        'gender':            'Пол',
        'negative':          'Негатив',
        'answerphone':       'Ответ робота',
    };
    var genderLabels = { 'GENDER_MALE': 'мужской', 'male': 'мужской', 'GENDER_FEMALE': 'женский', 'female': 'женский' };

    var chipsDiv = document.createElement('div');
    chipsDiv.className = 'classifier-chips';

    requestedList.forEach(function(name) {
        var chip = document.createElement('span');
        chip.className = 'classifier-chip';

        var label = namesRu[name] || name;
        var valueStr;

        if (name === 'gender') {
            var gd = byClassifier['gender'] || {};
            var male   = Math.round((gd['male']   || 0) * 100);
            var female = Math.round((gd['female'] || 0) * 100);
            label = 'Пол (мужской/женский)';
            valueStr = (male || female) ? male + '% / ' + female + '%' : '–';
        } else {
            var avg = (byClassifier[name] || {})['confidence'] || 0;
            valueStr = avg >= 0.005 ? Math.round(avg * 100) + '%' : '–';
        }

        chip.innerHTML = label + ' <span class="classifier-chip-value">: ' + valueStr + '</span>';
        chipsDiv.appendChild(chip);
    });

    content.appendChild(chipsDiv);
    section.style.display = '';
}
