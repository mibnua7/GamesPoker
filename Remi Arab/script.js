const suits = [
      { symbol: "♠", color: "black" }, { symbol: "♥", color: "red" },
      { symbol: "♦", color: "red" }, { symbol: "♣", color: "black" }
    ];
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    let deck, player, computer, discard, discardPile, rowBreaks, suggestedLayout, suggestionPass = 0, draggingStock = false, draggingCardId = null, selected = null, playerTurn = true, hasDrawn = false, gameOver = false, gameStarted = false;
    let scores = { player: 0, computer: 0 };

    const $ = id => document.getElementById(id);
    let audioContext = null;
    let musicTimer = null;
    let interactionStarted = false;
    let initialDealPending = false;

    function playTone(frequency, startTime, duration, volume = 0.035) {
      if (!audioContext) return;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.04);
    }

    function playCardSound(type) {
      if (!audioContext) return;
      const startTime = audioContext.currentTime + 0.02;
      if (type === "draw") {
        playTone(520, startTime, 0.12);
        playTone(700, startTime + 0.08, 0.12);
      } else {
        playTone(330, startTime, 0.14);
        playTone(220, startTime + 0.09, 0.14);
      }
    }

    function playDealSound(delay) {
      if (!audioContext) return;
      const startTime = audioContext.currentTime + delay;
      playTone(720, startTime, 0.08, 0.04);
      playTone(360, startTime + 0.04, 0.08, 0.025);
    }

    function scheduleBackgroundMusic() {
      if (!audioContext || musicTimer) return;
      const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
      const playLoop = () => {
        if (!audioContext) return;
        const startTime = audioContext.currentTime + 0.05;
        melody.forEach((note, index) => playTone(note, startTime + index * 0.45, 0.34, 0.018));
        musicTimer = window.setTimeout(playLoop, melody.length * 450);
      };
      playLoop();
    }

    function startAudio() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return Promise.resolve();
      audioContext = audioContext || new AudioContext();
      if (audioContext.state === "suspended") {
        return audioContext.resume().then(() => {
          scheduleBackgroundMusic();
        });
      }
      scheduleBackgroundMusic();
      return Promise.resolve();
    }

    function speakText(text) {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      let spoken = false;
      const speak = () => {
        if (spoken) return;
        spoken = true;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "id-ID";
        const indonesianVoice = window.speechSynthesis
          .getVoices()
          .find(voice => /^id(?:-|_)/i.test(voice.lang));
        if (indonesianVoice) utterance.voice = indonesianVoice;
        utterance.rate = 0.85;
        window.speechSynthesis.speak(utterance);
      };
      if (window.speechSynthesis.getVoices().length) {
        speak();
      } else {
        window.speechSynthesis.addEventListener("voiceschanged", speak, { once: true });
        window.setTimeout(speak, 300);
      }
    }

    function startInteraction() {
      if (interactionStarted) {
        startAudio();
        return;
      }
      interactionStarted = true;
      const audioReady = startAudio();
      if (initialDealPending) {
        Promise.resolve(audioReady).then(() => {
          if (!initialDealPending) return;
          initialDealPending = false;
          animateInitialDeal();
        });
      }
      $("hint").textContent = interactionStarted
        ? "Kamu jalan pertama: seret kartu ke tengah meja untuk membuang."
        : "Klik halaman untuk memulai permainan.";
      speakText("Permainan dimulai");
    }
    function makeDeck() {
      const result = [];
      for (let pack = 0; pack < 2; pack++) {
        suits.forEach(suit => ranks.forEach((rank, index) => result.push({
          id: `${pack}-${suit.symbol}-${rank}`, rank, suit: suit.symbol, color: suit.color, value: index + 1
        })));
        result.push({ id: `${pack}-joker-red`, rank: "Joker", suit: "★", color: "red", joker: true });
        result.push({ id: `${pack}-joker-black`, rank: "Joker", suit: "★", color: "black", joker: true });
      }
      return result.sort(() => Math.random() - .5);
    }
    function cardText(card) { return card.joker ? "JOKER" : `${card.rank}${card.suit}`; }
    function discardCardStyle(card) {
      const seed = [...card.id].reduce((total, character) => total + character.charCodeAt(0), 0);
      const rotation = (seed % 13) - 6;
      const offset = (seed % 7) - 3;
      return { rotation, offset };
    }
    function cardElement(card, hidden = false, index = -1) {
      const el = document.createElement("div");
      el.className = `card${hidden ? " back" : ` ${card.color}`}${card.joker ? " joker" : ""}`;
      if (!hidden) el.textContent = cardText(card);
      el.dataset.cardId = card.id;
      if (index >= 0) {
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", cardText(card));
        el.draggable = playerTurn && !gameOver && !isPinnedCard(card.id);
        el.classList.toggle("selected", selected === card.id);
        el.addEventListener("click", () => {
          if (!playerTurn || !hasDrawn || gameOver) return;
          selected = selected === card.id ? null : card.id;
          render();
        });
        el.addEventListener("dragstart", event => {
          if (!playerTurn || gameOver || isPinnedCard(card.id)) {
            event.preventDefault();
            if (isPinnedCard(card.id)) $("hint").textContent = "Lepas pin pola terlebih dahulu.";
            return;
          }
          draggingStock = false;
          draggingCardId = card.id;
          event.dataTransfer.setData("text/plain", card.id);
          event.dataTransfer.effectAllowed = "move";
        });
        el.addEventListener("dragend", () => { draggingCardId = null; });
        el.addEventListener("dragover", event => {
          if (!playerTurn || gameOver) return;
          event.preventDefault();
          el.classList.add("drop-target");
        });
        el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
        el.addEventListener("drop", event => {
          event.preventDefault();
          event.stopPropagation();
          if (draggingStock || getDraggedId(event) === "stock") {
            drawCard();
            return;
          }
          el.classList.remove("drop-target");
          const bounds = el.getBoundingClientRect();
          reorderCard(
            getDraggedId(event),
            card.id,
            event.clientX > bounds.left + bounds.width / 2
          );
        });
      }
      return el;
    }
    function reorderCard(cardId, targetId, insertAfter = false) {
      if (!playerTurn || gameOver || cardId === targetId) return;
      if (isPinnedCard(cardId) || isPinnedCard(targetId)) return;
      if (suggestedLayout) {
        moveCardInSuggestedLayout(cardId, targetId, insertAfter);
        return;
      }
      const sourceIndex = player.findIndex(card => card.id === cardId);
      const targetIndex = player.findIndex(card => card.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return;
      const [card] = player.splice(sourceIndex, 1);
      const newTargetIndex = player.findIndex(item => item.id === targetId);
      player.splice(newTargetIndex + (insertAfter ? 1 : 0), 0, card);
      rowBreaks.delete(cardId);
      suggestedLayout = null;
      suggestionPass = 0;
      selected = null;
      $("hint").textContent = "Urutan kartu diubah.";
      render();
    }
    function moveCardToNewColumn(cardId, targetColumn) {
      if (!playerTurn || gameOver || !suggestedLayout || isPinnedCard(cardId)) return;
      const sourceColumn = suggestedLayout.find(column => column.cards.some(card => card.id === cardId));
      if (!sourceColumn || !targetColumn) return;
      const sourceIndex = sourceColumn.cards.findIndex(card => card.id === cardId);
      const [card] = sourceColumn.cards.splice(sourceIndex, 1);
      const targetIndex = suggestedLayout.indexOf(targetColumn);
      suggestedLayout.splice(targetIndex + 1, 0, {
        label: `Hand ${suggestedLayout.length + 1}`,
        cards: [card],
        pinned: false
      });
      refreshPatternLabels();
      cleanupSuggestedLayout();
      player = suggestedLayout ? suggestedLayout.flatMap(column => column.cards) : player;
      selected = null;
      $("hint").textContent = "Kotak pola dibuat di area kosong.";
      render();
    }
    function moveCardInSuggestedLayout(cardId, targetId, insertAfter) {
      let sourceColumn = suggestedLayout.find(column => column.cards.some(card => card.id === cardId));
      const targetColumn = suggestedLayout.find(column => column.cards.some(card => card.id === targetId));
      if (!sourceColumn || !targetColumn) return;
      if (sourceColumn.pinned || targetColumn.pinned) {
        $("hint").textContent = "Lepas pin pola sebelum memindahkan kartu.";
        return;
      }
      const sourceIndex = sourceColumn.cards.findIndex(card => card.id === cardId);
      const [card] = sourceColumn.cards.splice(sourceIndex, 1);
      const targetIndex = targetColumn.cards.findIndex(item => item.id === targetId);
      targetColumn.cards.splice(targetIndex + (insertAfter ? 1 : 0), 0, card);
      sortPatternColumn(targetColumn);
      refreshPatternLabels();
      cleanupSuggestedLayout();
      player = suggestedLayout ? suggestedLayout.flatMap(column => column.cards) : player;
      selected = null;
      $("hint").textContent = "Kartu dipindahkan tanpa mengubah kotak pola.";
      render();
    }
    function sortPatternColumn(column) {
      if (column.label === "Kartu lain") return;
      const suitOrder = { "♠": 0, "♥": 1, "♦": 2, "♣": 3 };
      column.cards.sort((a, b) => patternLabel(column.cards).startsWith("Seri")
        ? a.value - b.value || suitOrder[a.suit] - suitOrder[b.suit]
        : suitOrder[a.suit] - suitOrder[b.suit]);
    }
    function patternLabel(cards) {
      if (cards.length >= 2 && cards.every(card => card.rank === cards[0].rank)) {
        if (cards.length >= 4) return "Bom";
        if (cards.length === 3) return "Tris";
        return "Per";
      }
      if (cards.length >= 2 && cards.every(card => card.suit === cards[0].suit)) {
        const values = [...new Set(cards.map(card => card.value))].sort((a, b) => a - b);
        const isSeries = values.length === cards.length
          && values.every((value, index) => index === 0 || value === values[index - 1] + 1);
        if (isSeries) return cards.length === 2 ? "Seri (kurang 1)" : "Seri";
      }
      return cards.length === 1 ? "Kartu tunggal" : "Kartu lain";
    }
    function refreshPatternLabels() {
      if (!suggestedLayout) return;
      suggestedLayout.forEach((column, index) => {
        column.label = index === 0 ? "Kartu random" : patternLabel(column.cards);
      });
    }
    function cleanupSuggestedLayout() {
      if (!suggestedLayout) return;
      suggestedLayout = suggestedLayout.filter(column => column.cards.length);
      if (!suggestedLayout.length) suggestedLayout = null;
      refreshPatternLabels();
    }
    function getDraggedId(event) {
      return event.dataTransfer.getData("text/plain") || draggingCardId || (draggingStock ? "stock" : "");
    }
    function moveCardToNewRow(cardId) {
      if (!playerTurn || gameOver) return;
      if (isPinnedCard(cardId)) return;
      const sourceColumn = suggestedLayout
        ? suggestedLayout.find(column => column.cards.some(item => item.id === cardId))
        : null;
      if (suggestedLayout && !sourceColumn) return;
      if (sourceColumn && sourceColumn.pinned) {
        $("hint").textContent = "Lepas pin pola sebelum membuat kotak baru.";
        return;
      }
      const sourceIndex = player.findIndex(card => card.id === cardId);
      if (sourceIndex < 0) return;
      const [card] = player.splice(sourceIndex, 1);
      player.push(card);
      if (suggestedLayout) {
        sourceColumn.cards = sourceColumn.cards.filter(item => item.id !== cardId);
        cleanupSuggestedLayout();
        suggestedLayout = suggestedLayout || [];
        suggestedLayout.push({ label: `Hand ${suggestedLayout.length + 1}`, cards: [card], pinned: false });
        refreshPatternLabels();
        player = suggestedLayout ? suggestedLayout.flatMap(column => column.cards) : player;
        selected = null;
        $("hint").textContent = "Kotak pola baru dibuat.";
        render();
        return;
      }
      suggestedLayout = [
        { label: "Kartu random", cards: player.filter(card => card.id !== cardId), pinned: false },
        { label: patternLabel([card]), cards: [card], pinned: false }
      ];
      refreshPatternLabels();
      player = suggestedLayout.flatMap(column => column.cards);
      suggestionPass = 0;
      selected = null;
      rowBreaks = new Set();
      $("hint").textContent = "Hand baru dibuat.";
      render();
    }
    function sortCards() {
      if (!playerTurn || gameOver) return;
      const suitOrder = { "♠": 0, "♥": 1, "♦": 2, "♣": 3 };
      const sorted = [...player].sort((a, b) => {
        if (a.joker && b.joker) return a.color.localeCompare(b.color);
        if (a.joker) return 1;
        if (b.joker) return -1;
        return a.value - b.value || suitOrder[a.suit] - suitOrder[b.suit];
      });
      const previousGroups = suggestedLayout
        ? suggestedLayout.filter(column => column.label !== "Kartu lain")
        : [];
      const previousOthers = suggestedLayout
        ? suggestedLayout.find(column => column.label === "Kartu lain")
        : null;
      const columns = previousGroups.map(column => ({
        label: column.label,
        cards: [...column.cards],
        pinned: Boolean(column.pinned),
        breakBefore: Boolean(column.breakBefore)
      }));
      const availableCards = previousOthers ? [...previousOthers.cards] : sorted;
      const available = new Set(availableCards.filter(card => !card.joker).map(card => card.id));
      const addColumn = (label, cards) => {
        cards.forEach(card => available.delete(card.id));
        columns.push({ label, cards, pinned: false });
      };
      const findSeries = (minimumSize) => {
        for (const suit of suits) {
          for (let start = 1; start <= 13; start++) {
            for (let size = 13; size >= minimumSize; size--) {
              const series = [];
              for (let value = start; value < start + size && value <= 13; value++) {
                const card = availableCards.find(item => available.has(item.id) && item.suit === suit.symbol && item.value === value);
                if (card) series.push(card);
              }
              if (series.length === size) {
                addColumn(size === 2 ? "Seri (kurang 1)" : "Seri", series);
                break;
              }
            }
          }
        }
      };
      findSeries(3);
      for (const rank of ranks) {
        const sameRank = availableCards.filter(card => available.has(card.id) && card.rank === rank);
        const distinctSuits = [...new Set(sameRank.map(card => card.suit))];
        if (distinctSuits.length >= 3) {
          if (sameRank.length >= 4) {
            addColumn("Bom", sameRank.slice(0, 4));
          } else {
            const rankGroup = distinctSuits.map(suit => sameRank.find(card => card.suit === suit));
            addColumn("Tris", rankGroup.slice(0, 3));
          }
        }
      }
      findSeries(2);
      if (suggestionPass > 0) {
        for (const rank of ranks) {
          const sameRank = availableCards.filter(card => available.has(card.id) && card.rank === rank);
          const distinctSuits = [...new Set(sameRank.map(card => card.suit))];
          if (distinctSuits.length >= 3) {
            if (sameRank.length >= 4) {
              addColumn("Bom", sameRank.slice(0, 4));
            } else {
              const rankGroup = distinctSuits.map(suit => sameRank.find(card => card.suit === suit));
              addColumn("Tris", rankGroup.slice(0, 3));
            }
          }
        }
      }
      const groupedIds = new Set(columns.flatMap(column => column.cards.map(card => card.id)));
      const others = sorted.filter(card => !groupedIds.has(card.id));
      if (others.length) columns.push({ label: "Kartu lain", cards: others, pinned: false });
      const othersIndex = columns.findIndex(column => column.label === "Kartu lain");
      if (othersIndex > 0) columns.unshift(columns.splice(othersIndex, 1)[0]);
      player = columns.flatMap(column => column.cards);
      suggestedLayout = columns;
      suggestionPass++;
      rowBreaks = new Set();
      selected = null;
      $("hint").textContent = suggestionPass === 1
        ? "Kombinasi yang sudah jadi dikelompokkan."
        : "Saran berikutnya mencari seri yang kurang satu kartu dan tris.";
      render();
    }
    function moveCardAboveRowBreak(cardId, beforeId) {
      if (!playerTurn || gameOver) return;
      if (isPinnedCard(cardId)) return;
      if (cardId === beforeId) {
        rowBreaks.delete(cardId);
        suggestedLayout = null;
        suggestionPass = 0;
        $("hint").textContent = "Baris kosong dihapus.";
        render();
        return;
      }
      const sourceIndex = player.findIndex(card => card.id === cardId);
      const beforeIndex = player.findIndex(card => card.id === beforeId);
      if (sourceIndex < 0 || beforeIndex < 0) return;
      const [card] = player.splice(sourceIndex, 1);
      player.splice(player.findIndex(item => item.id === beforeId), 0, card);
      rowBreaks.delete(cardId);
      suggestedLayout = null;
      suggestionPass = 0;
      selected = null;
      $("hint").textContent = "Kartu dipindahkan ke baris sebelumnya.";
      render();
    }
    function isPinnedCard(cardId) {
      return Boolean(suggestedLayout && suggestedLayout.some(column =>
        column.pinned && column.cards.some(card => card.id === cardId)
      ));
    }
    function removeCardFromSuggestedLayout(cardId) {
      if (!suggestedLayout) return;
      suggestedLayout = suggestedLayout
        .map(column => ({ ...column, cards: column.cards.filter(card => card.id !== cardId) }))
        .filter(column => column.cards.length || column.label === "Kartu lain");
      cleanupSuggestedLayout();
    }
    function addCardToSuggestedLayout(card) {
      if (!suggestedLayout) return;
      suggestedLayout[0].cards.push(card);
      refreshPatternLabels();
      player = suggestedLayout.flatMap(column => column.cards);
    }
    function findDropTarget(zone, x, y) {
      const cardsInRow = [...zone.querySelectorAll(".card")].filter(card => {
        const bounds = card.getBoundingClientRect();
        return y >= bounds.top && y <= bounds.bottom;
      });
      if (!cardsInRow.length) return null;
      const target = cardsInRow.reduce((closest, card) => {
        const bounds = card.getBoundingClientRect();
        const distance = Math.abs(x - (bounds.left + bounds.width / 2));
        return !closest || distance < closest.distance ? { card, distance } : closest;
      }, null);
      const bounds = target.card.getBoundingClientRect();
      return { id: target.card.dataset.cardId, insertAfter: x > bounds.left + bounds.width / 2 };
    }
    function configureHandDropZone(zone) {
      zone.addEventListener("dragover", event => {
        if (!playerTurn || gameOver) return;
        event.preventDefault();
        zone.classList.add("drag-over");
      });
      zone.addEventListener("dragleave", event => {
        if (!event.relatedTarget || !zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
      });
      zone.addEventListener("drop", event => {
        event.preventDefault();
        zone.classList.remove("drag-over");
        const draggedId = getDraggedId(event);
        if (draggingStock || draggedId === "stock") {
          drawCard();
          return;
        }
        const droppedBreak = [...zone.querySelectorAll(".row-break")].find(rowBreak => {
          const bounds = rowBreak.getBoundingClientRect();
          return event.clientX >= bounds.left && event.clientX <= bounds.right &&
            event.clientY >= bounds.top && event.clientY <= bounds.bottom;
        });
        if (droppedBreak) {
          moveCardAboveRowBreak(draggedId, droppedBreak.dataset.beforeId);
          return;
        }
        const columns = [...zone.querySelectorAll(".hand-column")];
        const targetCandidates = columns
          .map((columnElement, index) => ({ columnElement, index, bounds: columnElement.getBoundingClientRect() }))
          .filter(item => event.clientY >= item.bounds.top && event.clientY <= item.bounds.bottom && event.clientX > item.bounds.right)
          .sort((a, b) => a.bounds.right - b.bounds.right);
        const targetColumn = targetCandidates[targetCandidates.length - 1];
        const targetIndex = targetColumn ? targetColumn.index : -1;
        if (suggestedLayout && targetIndex >= 0) {
          moveCardToNewColumn(draggedId, suggestedLayout[targetIndex]);
          return;
        }
        const target = event.target.closest(".card");
        const dropTarget = target && target.parentElement === zone
          ? {
            id: target.dataset.cardId,
            insertAfter: event.clientX > target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2
          }
          : findDropTarget(zone, event.clientX, event.clientY);
        if (dropTarget) {
          reorderCard(draggedId, dropTarget.id, dropTarget.insertAfter);
        } else {
          moveCardToNewRow(draggedId);
        }
      });
    }
    function configureDiscardDropZone(zone) {
      zone.addEventListener("dragover", event => {
        if (!playerTurn || !hasDrawn || gameOver) return;
        event.preventDefault();
        zone.classList.add("drag-over");
      });
      zone.addEventListener("dragleave", event => {
        if (!event.relatedTarget || !zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
      });
      zone.addEventListener("drop", event => {
        event.preventDefault();
        zone.classList.remove("drag-over");
        const cardId = getDraggedId(event);
        if (cardId !== "stock") discardPlayerCard(cardId);
      });
    }
    function render() {
      const opponentView = $("opponent-cards");
      opponentView.replaceChildren();
      computer.forEach(card => opponentView.appendChild(cardElement(card, true)));
      const playerView = $("player-cards");
      playerView.replaceChildren();
      playerView.classList.toggle("suggested-layout", Boolean(suggestedLayout));
      if (suggestedLayout) {
        suggestedLayout.forEach((column, columnIndex) => {
          const columnElement = document.createElement("div");
          columnElement.className = `hand-column${columnIndex === 0 ? " main-hand" : ""}`;
          columnElement.addEventListener("dragover", event => {
            if (!playerTurn || gameOver) return;
            event.preventDefault();
            columnElement.classList.add("drag-over");
          });
          columnElement.addEventListener("dragleave", () => columnElement.classList.remove("drag-over"));
          columnElement.addEventListener("drop", event => {
            event.preventDefault();
            event.stopPropagation();
            columnElement.classList.remove("drag-over");
            const cardId = getDraggedId(event);
            if (draggingStock || cardId === "stock") {
              drawCard();
              return;
            }
            const lastCard = column.cards[column.cards.length - 1];
            if (lastCard) reorderCard(cardId, lastCard.id, true);
          });
          const title = document.createElement("div");
          title.className = "hand-column-title";
          title.textContent = column.label || `Hand ${columnIndex + 1}`;
          columnElement.appendChild(title);
          column.cards.forEach(card => columnElement.appendChild(cardElement(card, false, 0)));
          playerView.appendChild(columnElement);
        });
      } else {
        player.forEach((card, index) => {
          if (rowBreaks.has(card.id)) {
            const breakElement = document.createElement("div");
            breakElement.className = "row-break";
            breakElement.dataset.beforeId = card.id;
            breakElement.addEventListener("dragover", event => {
              if (!playerTurn || gameOver) return;
              event.preventDefault();
              breakElement.classList.add("drag-over");
            });
            breakElement.addEventListener("dragleave", () => breakElement.classList.remove("drag-over"));
            breakElement.addEventListener("drop", event => {
              event.preventDefault();
              event.stopPropagation();
              breakElement.classList.remove("drag-over");
              const cardId = getDraggedId(event);
              if (draggingStock || cardId === "stock") drawCard();
              else moveCardAboveRowBreak(cardId, card.id);
            });
            playerView.appendChild(breakElement);
          }
          playerView.appendChild(cardElement(card, false, index));
        });
      }
      $("stock-count").textContent = deck.length;
      $("opponent-count").textContent = `${computer.length} kartu`;
      $("player-count").textContent = `${player.length} kartu`;
      $("player-score").textContent = scores.player;
      $("computer-score").textContent = scores.computer;
      const discardView = $("discard-card");
      discardView.classList.toggle("has-discard", discardPile.length > 0);
      if (discardPile.length) {
        const visibleCards = discardPile.slice(-6);
        discardView.replaceChildren(...visibleCards.map((card, index) => {
          const pileCard = cardElement(card);
          const { rotation, offset } = discardCardStyle(card);
          pileCard.classList.add("discard-history-card");
          pileCard.style.setProperty("--discard-rotation", `${rotation}deg`);
          pileCard.style.setProperty("--discard-offset", `${offset + (index % 2 ? 2 : -2)}px`);
          pileCard.style.zIndex = String(index + 1);
          return pileCard;
        }));
      } else {
        discardView.replaceChildren();
      }
      $("stock").classList.toggle("disabled", deck.length === 0);
      $("stock").draggable = playerTurn && !hasDrawn && !gameOver && deck.length > 0;
      const playerHasWon = player.length === 14 && canWin(player);
      $("status").textContent = !gameStarted
        ? "Klik untuk memulai permainan"
        : gameOver
          ? "Permainan selesai"
          : playerTurn
            ? (hasDrawn ? "Giliranmu: buang kartu" : "Giliranmu: ambil kartu")
            : "Komputer sedang berpikir...";
      if (!gameOver && playerHasWon) {
        finish("Kamu menang!", "Kombinasimu terdiri dari 14 kartu yang sah.");
      }
    }
    function animateInitialDeal() {
      const source = $("stock").getBoundingClientRect();
      const sourceX = source.left + source.width / 2;
      const sourceY = source.top + source.height / 2;
      const cards = document.querySelectorAll("#opponent-cards .card, #player-cards > .card");
      cards.forEach((card, index) => {
        const target = card.getBoundingClientRect();
        card.classList.add("deal-flying");
        card.style.setProperty("--deal-x", `${sourceX - (target.left + target.width / 2)}px`);
        card.style.setProperty("--deal-y", `${sourceY - (target.top + target.height / 2)}px`);
        card.style.animationDelay = `${Math.min(index * 42, 1100)}ms`;
        playDealSound(index * 0.042);
      });
      window.setTimeout(() => cards.forEach(card => {
        card.classList.remove("deal-flying");
        card.style.removeProperty("--deal-x");
        card.style.removeProperty("--deal-y");
        card.style.animationDelay = "";
      }), 2050);
    }
    function startGame() {
      gameStarted = true;
      $("modal").hidden = true;
      deck = makeDeck();
      player = deck.splice(0, 15);
      computer = deck.splice(0, 14);
      const suitOrder = { "♠": 0, "♥": 1, "♦": 2, "♣": 3 };
      player.sort((a, b) => {
        if (a.joker && b.joker) return a.color.localeCompare(b.color);
        if (a.joker) return 1;
        if (b.joker) return -1;
        return a.value - b.value || suitOrder[a.suit] - suitOrder[b.suit];
      });
      discard = null; discardPile = []; rowBreaks = new Set(); suggestedLayout = null; suggestionPass = 0; selected = null; playerTurn = true; hasDrawn = true; gameOver = false;
      $("hint").textContent = interactionStarted
        ? "Kamu jalan pertama: seret kartu ke tengah meja untuk membuang."
        : "Klik halaman untuk memulai permainan.";
      render();
      if (interactionStarted && !initialDealPending) animateInitialDeal();
      else initialDealPending = true;
    }
    function animateDrawToPlayer(sourceRect) {
      animateDrawToTarget(sourceRect, $("player-cards"));
    }
    function animateDrawToOpponent(sourceRect) {
      animateDrawToTarget(sourceRect, $("opponent-cards"));
    }
    function animateDrawToTarget(sourceRect, targetElement) {
      const targetRect = targetElement.getBoundingClientRect();
      const flyingCard = document.createElement("div");
      flyingCard.className = "card back draw-flying";
      flyingCard.style.left = `${sourceRect.left}px`;
      flyingCard.style.top = `${sourceRect.top}px`;
      flyingCard.style.setProperty("--draw-x", `${targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2}px`);
      flyingCard.style.setProperty("--draw-y", `${targetRect.top + targetRect.height / 2 - sourceRect.top - sourceRect.height / 2}px`);
      flyingCard.style.width = `${sourceRect.width}px`;
      flyingCard.style.height = `${sourceRect.height}px`;
      document.body.appendChild(flyingCard);
      flyingCard.addEventListener("animationend", () => flyingCard.remove(), { once: true });
    }
    function animateDiscardToMiddle(card, sourceRect) {
      if (!sourceRect) return;
      const targetRect = document.querySelector(".discard").getBoundingClientRect();
      const flyingCard = cardElement(card);
      flyingCard.classList.add("discard-flying");
      flyingCard.style.left = `${sourceRect.left}px`;
      flyingCard.style.top = `${sourceRect.top}px`;
      flyingCard.style.width = `${sourceRect.width}px`;
      flyingCard.style.height = `${sourceRect.height}px`;
      flyingCard.style.setProperty("--discard-x", `${targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2}px`);
      flyingCard.style.setProperty("--discard-y", `${targetRect.top + targetRect.height / 2 - sourceRect.top - sourceRect.height / 2}px`);
      document.body.appendChild(flyingCard);
      flyingCard.addEventListener("animationend", () => flyingCard.remove(), { once: true });
    }
    function showStartModal() {
      $("modal-title").textContent = "Mulai permainan";
      $("modal-text").textContent = "Klik tombol di bawah untuk membagikan kartu.";
      $("modal-close").textContent = "Klik untuk bermain";
      $("modal").hidden = false;
    }
    function drawCard() {
      if (!playerTurn || hasDrawn || gameOver || !deck.length) return;
      const sourceRect = $("stock").getBoundingClientRect();
      player.push(deck.pop());
      playCardSound("draw");
      hasDrawn = true;
      suggestionPass = 0;
      addCardToSuggestedLayout(player[player.length - 1]);
      $("hint").textContent = "Seret kartu dari tanganmu ke tengah meja untuk membuang.";
      render();
      animateDrawToPlayer(sourceRect);
    }
    function discardPlayerCard(cardId = selected) {
      if (!playerTurn || !hasDrawn || gameOver) return;
      if (isPinnedCard(cardId)) {
        $("hint").textContent = "Lepas pin pola terlebih dahulu sebelum membuang kartu ini.";
        return;
      }
      const selectedIndex = player.findIndex(card => card.id === cardId);
      if (selectedIndex < 0) return;
      const sourceElement = document.querySelector(`[data-card-id="${cardId}"]`);
      const sourceRect = sourceElement ? sourceElement.getBoundingClientRect() : null;
      discard = player.splice(selectedIndex, 1)[0];
      discardPile.push(discard);
      playCardSound("discard");
      suggestionPass = 0;
      removeCardFromSuggestedLayout(cardId);
      selected = null;
      if (player.length === 14 && canWin(player)) {
        finish("Kamu menang!", "Kombinasimu terdiri dari 14 kartu yang sah.");
        animateDiscardToMiddle(discard, sourceRect);
        return;
      }
      playerTurn = false; hasDrawn = false;
      render();
      animateDiscardToMiddle(discard, sourceRect);
      window.setTimeout(computerTurn, 700);
    }
    function computerTurn() {
      if (gameOver) return;
      const finishComputerTurn = () => {
        if (gameOver) return;
        const winning = canWin(computer.slice(0, 14)) && computer.length === 15;
        if (winning) { finish("Komputer menang", "Komputer berhasil menyusun 14 kartu."); return; }
        let removeIndex = computer.findIndex((card, index) => !computer.slice(0, index).some(other => other.rank === card.rank && !card.joker && !other.joker));
        if (removeIndex < 0) removeIndex = Math.floor(Math.random() * computer.length);
        const discardedCard = computer[removeIndex];
        const sourceElement = document.querySelector(`[data-card-id="${discardedCard.id}"]`);
        const sourceRect = sourceElement ? sourceElement.getBoundingClientRect() : null;
        discard = computer.splice(removeIndex, 1)[0];
        discardPile.push(discard);
        playCardSound("discard");
        playerTurn = true;
        $("hint").textContent = "Seret sisa kartu ke area kartu kamu untuk mengambil.";
        render();
        animateDiscardToMiddle(discard, sourceRect);
      };
      if (deck.length) {
        const sourceRect = $("stock").getBoundingClientRect();
        computer.push(deck.pop());
        playCardSound("draw");
        render();
        animateDrawToOpponent(sourceRect);
        window.setTimeout(finishComputerTurn, 560);
        return;
      }
      finishComputerTurn();
    }
    function finish(title, text) {
      gameOver = true;
      if (title.startsWith("Kamu")) scores.player++; else scores.computer++;
      render();
      $("modal-title").textContent = title;
      $("modal-text").textContent = text;
      $("modal").hidden = false;
    }
    function canWin(cards) {
      if (cards.length !== 14) return false;
      const jokers = cards.filter(card => card.joker).length;
      const normal = cards.filter(card => !card.joker);
      const combinations = (pool, size, start = 0, current = []) => {
        if (current.length === size) return [current];
        const results = [];
        for (let index = start; index <= pool.length - (size - current.length); index++) {
          results.push(...combinations(pool, size, index + 1, [...current, pool[index]]));
        }
        return results;
      };
      const removeCards = (source, removed) => source.filter(card => !removed.includes(card));
      const search = (remaining, wild) => {
        if (!remaining.length) return wild === 0;
        const first = remaining[0];

        const sameRank = remaining.filter(card => card.rank === first.rank);
        for (let size = 3; size <= 4; size++) {
          for (let normalSize = Math.max(1, size - wild); normalSize <= Math.min(size, sameRank.length); normalSize++) {
            for (const group of combinations(sameRank, normalSize)) {
              if (!group.includes(first)) continue;
              const wildNeeded = size - group.length;
              if (wildNeeded <= wild && search(removeCards(remaining, group), wild - wildNeeded)) return true;
            }
          }
        }

        for (const suit of suits) {
          if (first.suit !== suit.symbol) continue;
          for (let size = 3; size <= 13; size++) {
            for (let start = Math.max(1, first.value - size + 1); start <= first.value && start + size - 1 <= 13; start++) {
              const selected = [];
              let valid = true;
              for (let value = start; value < start + size; value++) {
                const candidate = remaining.find(card =>
                  card.suit === suit.symbol && card.value === value && !selected.includes(card)
                );
                if (candidate) selected.push(candidate);
              }
              const wildNeeded = size - selected.length;
              if (valid && selected.includes(first) && wildNeeded <= wild
                && search(removeCards(remaining, selected), wild - wildNeeded)) return true;
            }
          }
        }
        return false;
      };
      return search(normal, jokers);
    }
    $("new-game").addEventListener("click", startGame);
    $("modal-close").addEventListener("click", () => { $("modal").hidden = true; startGame(); });
    document.addEventListener("pointerdown", startInteraction, true);
    configureHandDropZone($("player-cards"));
    configureDiscardDropZone(document.querySelector(".middle"));
    $("stock").addEventListener("dragstart", event => {
      if (!playerTurn || hasDrawn || gameOver || !deck.length) {
        event.preventDefault();
        return;
      }
      draggingStock = true;
      draggingCardId = null;
      event.dataTransfer.setData("text/plain", "stock");
      event.dataTransfer.effectAllowed = "move";
    });
    $("stock").addEventListener("dragend", () => { draggingStock = false; draggingCardId = null; });
    $("stock").addEventListener("click", drawCard);
    $("stock").addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        drawCard();
      }
    });
    deck = [];
    player = [];
    computer = [];
    discard = null;
    discardPile = [];
    rowBreaks = new Set();
    suggestedLayout = null;
    selected = null;
    playerTurn = true;
    hasDrawn = false;
    gameOver = false;
    render();
    showStartModal();
