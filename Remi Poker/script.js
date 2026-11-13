const suits = [
  { symbol: "♠", name: "Sekop", color: "black" },
  { symbol: "♥", name: "Hati", color: "red" },
  { symbol: "♦", name: "Wajik", color: "red" },
  { symbol: "♣", name: "Keriting", color: "black" },
];
const ranks = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];
let players = [];
let openingThrees = [];
let showOpeningThrees = false;
let threeCounts = [];
let originalHumanOrder = [];
let sortMode = 0;
let selectedCards = [];
let playedGroups = [];
let lastPlayedCards = [];
let currentPlayer = 0;
let currentPlay = null;
let lastPlayPlayer = null;
let passCount = 0;
let freeWay = true;
let dealing = false;
let dealAnimation = null;
let started = false;
let gameOver = false;
let round = 1;
let nextRoundAvailable = false;
let previousWinner = null;
let finishOrder = [];
let turnOrder = [0, 1, 2, 3];
let seatSlots = [1, 4, 2, 3];
let difficulty = "normal";
let nextBonus = "none";
let audioContext = null;
let musicTimer = null;
const dealAudioSources = new Set();
let musicEnabled = true;
let initialStartPending = false;
let initialGameJustStarted = false;
const difficultyNames = { easy: "Easy", normal: "Normal", hard: "Hard" };
const bonusNames = {
  none: "Tidak ada",
  per: "Per",
  tris: "Tris",
  fullHouse: "Polo / Full House",
  poloSeri: "Polo Seri",
  seri: "Seri",
  bom: "Bom",
};
const hesitationChance = { easy: 0.65, normal: 0.4, hard: 0.15 };
const sortModeLabels = [
  "urutan awal",
  "kecil → besar",
  "kelompok tris/per",
  "besar → kecil",
  "kelompok logo",
];

const $ = (id) => document.getElementById(id);

function makeDeck() {
  return suits.flatMap((suit, suitIndex) =>
    ranks.map((rank, rankIndex) => ({
      id: `${suitIndex}-${rankIndex}`,
      rank,
      suit: suit.symbol,
      suitName: suit.name,
      color: suit.color,
    })),
  );
}

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function determineStartingPlayer() {
  const allPlayersHaveThree = threeCounts.every((count) => count > 0);
  if (allPlayersHaveThree) {
    return players.findIndex((player) =>
      player.hand.some((card) => card.rank === "3" && card.suit === "♠"),
    );
  }

  const mostThrees = Math.max(...threeCounts);
  const tiedPlayers = threeCounts
    .map((count, playerId) => (count === mostThrees ? playerId : -1))
    .filter((playerId) => playerId >= 0);
  const spadeThreeOwner = tiedPlayers.find((playerId) =>
    players[playerId].hand.some(
      (card) => card.rank === "3" && card.suit === "♠",
    ),
  );
  return spadeThreeOwner ?? tiedPlayers[0];
}

function startingPlayerMessage() {
  const label = currentPlayer === 0 ? "Kamu" : `Bot ${currentPlayer}`;
  const allPlayersHaveThree = threeCounts.every((count) => count > 0);
  if (allPlayersHaveThree) {
    return `Semua pemain mengeluarkan kartu 3. 3 sekop menentukan giliran: ${label} jalan pertama.`;
  }
  return `Jumlah kartu 3: Kamu ${threeCounts[0]}, Bot 1 ${threeCounts[1]}, Bot 2 ${threeCounts[2]}, Bot 3 ${threeCounts[3]}. ${label} memiliki kartu 3 terbanyak dan jalan pertama.`;
}

function isMurni(hand) {
  return hand.every((card) => !["J", "Q", "K"].includes(card.rank));
}

function takeBonusCards(deck, rank, count) {
  const cards = deck.filter((card) => card.rank === rank).slice(0, count);
  cards.forEach((card) => deck.splice(deck.indexOf(card), 1));
  return cards;
}

function randomBonusRank(deck, excludedRanks = []) {
  const availableRanks = [
    ...new Set(
      deck
        .filter(
          (card) =>
            !["2", "3", "J", "Q", "K"].includes(card.rank) &&
            !excludedRanks.includes(card.rank),
        )
        .map((card) => card.rank),
    ),
  ];
  return availableRanks[Math.floor(Math.random() * availableRanks.length)];
}

function takeRandomStraightCards(deck) {
  const straightOptions = [
    ["4", "5", "6"],
    ["5", "6", "7"],
    ["6", "7", "8"],
    ["7", "8", "9"],
    ["8", "9", "10"],
  ];
  const straightRanks =
    straightOptions[Math.floor(Math.random() * straightOptions.length)];
  const suit = suits[Math.floor(Math.random() * suits.length)].symbol;
  const cards = straightRanks.map((rank) =>
    deck.find((card) => card.rank === rank && card.suit === suit),
  );
  cards.forEach((card) => deck.splice(deck.indexOf(card), 1));
  return { cards, ranks: straightRanks };
}

function getBonusCards(deck, bonusType) {
  if (bonusType === "per")
    return takeBonusCards(deck, randomBonusRank(deck), 2);
  if (bonusType === "tris")
    return takeBonusCards(deck, randomBonusRank(deck), 3);
  if (bonusType === "bom")
    return takeBonusCards(deck, randomBonusRank(deck), 4);
  if (bonusType === "fullHouse") {
    const tripleRank = randomBonusRank(deck);
    const pairRank = randomBonusRank(deck, [tripleRank]);
    return [
      ...takeBonusCards(deck, tripleRank, 3),
      ...takeBonusCards(deck, pairRank, 2),
    ];
  }
  if (bonusType === "poloSeri") {
    const straight = takeRandomStraightCards(deck);
    const pairRank = randomBonusRank(deck, straight.ranks);
    return [...straight.cards, ...takeBonusCards(deck, pairRank, 2)];
  }
  if (bonusType === "seri") {
    return takeRandomStraightCards(deck).cards;
  }
  return [];
}

function dealPlayers(bonusType) {
  const deck = shuffle(makeDeck());
  const bonusCards = getBonusCards(deck, bonusType);
  const humanCards = [...bonusCards, ...deck.splice(0, 13 - bonusCards.length)];
  return [
    { id: 0, hand: humanCards },
    ...[1, 2, 3].map((id) => ({ id, hand: deck.splice(0, 13) })),
  ];
}

function startRound(roundNumber, starter, collectThrees) {
  let dealtPlayers;
  let redealCount = 0;
  let hasMurni;
  const selectedBonus = nextBonus;
  do {
    dealtPlayers = dealPlayers(selectedBonus);
    const murniPlayers = dealtPlayers.filter((player) => isMurni(player.hand));
    hasMurni = murniPlayers.length > 0;
    if (hasMurni) redealCount++;
  } while (hasMurni);

  players = dealtPlayers;
  threeCounts = collectThrees
    ? players.map(
        (player) => player.hand.filter((card) => card.rank === "3").length,
      )
    : [];
  openingThrees = collectThrees
    ? players.flatMap((player) =>
        player.hand.filter((card) => card.rank === "3"),
      )
    : [];
  showOpeningThrees = !collectThrees;
  currentPlayer = collectThrees ? determineStartingPlayer() : starter;
  originalHumanOrder = players[0].hand.map((card) => card.id);
  sortMode = 1;
  sortHumanHand();
  selectedCards = [];
  playedGroups = [];
  lastPlayedCards = [];
  currentPlay = null;
  lastPlayPlayer = null;
  passCount = 0;
  freeWay = true;
  started = true;
  dealing = true;
  gameOver = false;
  finishOrder = [];
  round = roundNumber;
  nextRoundAvailable = false;
  nextBonus = "none";
  $("next-bonus").value = "none";
  render();
  const dealDuration = animateDeal(() => {
    if (collectThrees) {
      collectOpeningThrees();
    } else {
      dealing = false;
    }
  });
  if (collectThrees) {
    setStatus(
      redealCount > 0
        ? `Bonus ${bonusNames[selectedBonus]} diberikan. Ada pemain murni, kartu dikocok ulang ${redealCount} kali. ${startingPlayerMessage()}`
        : startingPlayerMessage(),
    );
  } else {
    const label = currentPlayer === 0 ? "Kamu" : `Bot ${currentPlayer}`;
    setStatus(
      redealCount > 0
        ? `Bonus ${bonusNames[selectedBonus]} diberikan. Ada pemain murni, kartu dikocok ulang ${redealCount} kali. Babak ${round} dimulai. ${label} mendapat giliran.`
        : `Babak ${round} dimulai. ${label} adalah pemenang sebelumnya dan mendapat giliran.${selectedBonus !== "none" ? ` Bonus ${bonusNames[selectedBonus]} diberikan.` : ""}`,
    );
  }
  if (currentPlayer !== 0) {
    window.setTimeout(botTurn, dealDuration + (collectThrees ? 1600 : 100));
  }
}

function deal() {
  previousWinner = null;
  turnOrder = [0, 1, 2, 3];
  assignSeatsToTurnOrder();
  startRound(1, null, true);
}

function assignSeatsToTurnOrder() {
  const clockwiseSlots = [4, 2, 3];
  const userPosition = turnOrder.indexOf(0);
  seatSlots = [1, 0, 0, 0];
  for (let offset = 1; offset < turnOrder.length; offset++) {
    const playerId = turnOrder[(userPosition + offset) % turnOrder.length];
    seatSlots[playerId] = clockwiseSlots[offset - 1];
  }
}

function startNextRound() {
  if (!nextRoundAvailable || previousWinner === null) return;
  const previousFinishOrder = finishOrder.slice();
  turnOrder = previousFinishOrder;
  assignSeatsToTurnOrder();
  startRound(round + 1, previousWinner, false);
}

function handleNewGame() {
  if (!started) return;
  if (initialGameJustStarted) {
    initialGameJustStarted = false;
    return;
  }
  if (nextRoundAvailable) {
    startNextRound();
  } else {
    deal();
  }
}

function isFinished(playerId) {
  return finishOrder.includes(playerId);
}

function nextActivePlayer(playerId) {
  const currentIndex = turnOrder.indexOf(playerId);
  for (let offset = 1; offset <= 4; offset++) {
    const candidate = turnOrder[(currentIndex + offset) % turnOrder.length];
    if (!isFinished(candidate)) return candidate;
  }
  return playerId;
}

function finishMessage() {
  const ranking = finishOrder
    .map(
      (playerId, index) =>
        `${index + 1}. ${playerId === 0 ? "Kamu" : `Bot ${playerId}`}`,
    )
    .join(" · ");
  return `Urutan selesai: ${ranking}. Klik tombol untuk lanjut ke Babak ${round + 1}.`;
}

function cardHtml(
  card,
  clickable = false,
  stackIndex = null,
  stackCount = null,
  groupOffset = 0,
  groupIndex = 0,
) {
  const classes = `card ${card.color === "red" ? "red" : ""} ${selectedCards.includes(card.id) ? "selected" : ""}`;
  const horizontalOffset =
    stackCount === null
      ? 0
      : groupOffset + (stackIndex - (stackCount - 1) / 2) * 18;
  const stackStyle =
    stackIndex === null
      ? ""
      : ` style="transform: translate(${horizontalOffset}px, ${groupIndex * 0.8}px) rotate(${-7 + (stackIndex % 5) * 3}deg); z-index: ${groupIndex * 10 + stackIndex + 1};"`;
  return `<div class="${classes}${stackIndex === null ? "" : " discarded-card"}"${stackStyle} ${clickable ? `data-card-id="${card.id}" tabindex="0" role="button" aria-label="${card.rank} ${card.suitName}"` : ""}>
        <span class="corner">${card.rank}<br>${card.suit}</span><span class="suit">${card.suit}</span>
      </div>`;
}

function rankValue(rank) {
  if (rank === "2") return 15;
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return Number(rank);
}

function sortHumanHand() {
  const hand = players[0].hand;
  const originalIndex = new Map(
    originalHumanOrder.map((cardId, index) => [cardId, index]),
  );
  const rankComparator = (a, b) =>
    rankValue(a.rank) - rankValue(b.rank) || a.suit.localeCompare(b.suit);
  if (sortMode === 0) {
    hand.sort((a, b) => originalIndex.get(a.id) - originalIndex.get(b.id));
  } else if (sortMode === 1) {
    hand.sort(rankComparator);
  } else if (sortMode === 2) {
    const counts = hand.reduce(
      (all, card) => ({ ...all, [card.rank]: (all[card.rank] || 0) + 1 }),
      {},
    );
    hand.sort(
      (a, b) => counts[b.rank] - counts[a.rank] || rankComparator(a, b),
    );
  } else if (sortMode === 3) {
    hand.sort((a, b) => rankComparator(b, a));
  } else {
    const suitIndex = (card) =>
      suits.findIndex((suit) => suit.symbol === card.suit);
    hand.sort((a, b) => suitIndex(a) - suitIndex(b) || rankComparator(a, b));
  }
}

function cycleSortMode() {
  if (!started) return;
  sortMode = (sortMode + 1) % sortModeLabels.length;
  sortHumanHand();
  render();
}

function isStraight(cards) {
  if (
    cards.some((card) => card.rank === "2") ||
    new Set(cards.map((card) => card.rank)).size !== cards.length
  )
    return false;
  const sorted = cards
    .slice()
    .sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
  return (
    sorted.every(
      (card, index) =>
        index === 0 ||
        rankValue(card.rank) === rankValue(sorted[index - 1].rank) + 1,
    ) && sorted.every((card) => card.suit === sorted[0].suit)
  );
}

function isFullHouse(cards) {
  const counts = Object.values(
    cards.reduce(
      (all, card) => ({
        ...all,
        [card.rank]: (all[card.rank] || 0) + 1,
      }),
      {},
    ),
  ).sort((a, b) => a - b);
  return cards.length === 5 && counts.join(",") === "2,3";
}

function isStraightPair(cards) {
  return Boolean(getStraightPairParts(cards));
}

function getStraightPairParts(cards) {
  if (cards.length !== 5) return null;
  for (let first = 0; first < cards.length - 2; first += 1) {
    for (let second = first + 1; second < cards.length - 1; second += 1) {
      for (let third = second + 1; third < cards.length; third += 1) {
    const sequence = [cards[first], cards[second], cards[third]];
    if (!isStraight(sequence)) continue;
    const sequenceIds = new Set(sequence.map((card) => card.id));
    const pair = cards.filter((card) => !sequenceIds.has(card.id));
    if (pair.length === 2 && pair[0].rank === pair[1].rank) {
      return {
        sequence,
        pair,
      };
    }
      }
    }
  }
  return null;
}

function playType(cards) {
  if (cards.length === 1) return "tunggal";
  if (cards.length === 2 && cards.every((card) => card.rank === cards[0].rank))
    return "per";
  if (cards.length === 3 && cards.every((card) => card.rank === cards[0].rank))
    return "tris";
  if (cards.length === 3 && isStraight(cards)) return "seri";
  if (cards.length === 4 && cards.every((card) => card.rank === cards[0].rank))
    return "bom";
  if (cards.length === 5 && isStraightPair(cards)) return "poloSeri";
  if (cards.length === 5 && isFullHouse(cards)) return "fullHouse";
  if (cards.length === 5 && isStraight(cards)) return "piting";
  return null;
}

function playRankValue(cards, type = playType(cards)) {
  if (type === "fullHouse") {
    const triple = cards.find(
      (card) =>
        cards.filter((candidate) => candidate.rank === card.rank).length === 3,
    );
    return rankValue(triple.rank);
  }
  if (type === "poloSeri") {
    return Math.max(...getStraightPairParts(cards).sequence.map((card) => rankValue(card.rank)));
  }
  return Math.max(...cards.map((card) => rankValue(card.rank)));
}

function getSelectedCards(playerId = 0) {
  return players[playerId].hand.filter((card) =>
    selectedCards.includes(card.id),
  );
}

function canPlay(cards) {
  const type = playType(cards);
  if (!type) return false;
  const respondsToTwo =
    currentPlay && currentPlay.cards.some((card) => card.rank === "2");
  if (respondsToTwo && currentPlayer !== lastPlayPlayer) return type === "bom";
  if (freeWay || !currentPlay) return true;
  if (type === "piting")
    return (
      currentPlay.type !== "piting" ||
      playRankValue(cards, type) > currentPlay.rankValue
    );
  if (currentPlay.type === "piting") return false;
  if (type === "bom") {
    return (
      currentPlay.type === "bom" &&
      playRankValue(cards, type) > currentPlay.rankValue
    );
  }
  if (currentPlay.type === "bom") return false;
  return (
    type === currentPlay.type &&
    playRankValue(cards, type) > currentPlay.rankValue
  );
}

function playDescription(cards) {
  const type = playType(cards);
  if (type === "tunggal") return `Angka ${cards[0].rank}`;
  if (type === "per") return `Per ${cards[0].rank}`;
  if (type === "tris") return `Tris ${cards[0].rank}`;
  if (type === "fullHouse")
    return `Polo ${
      cards.find(
        (card) =>
          cards.filter((candidate) => candidate.rank === card.rank).length ===
          3,
      ).rank
    }`;
  if (type === "poloSeri") {
    const { sequence, pair } = getStraightPairParts(cards);
    const pairRank = pair[0].rank;
    const sequenceText = sequence
      .sort((a, b) => rankValue(a.rank) - rankValue(b.rank))
      .map((card) => card.rank)
      .join(", ");
    return `Polo Seri ${sequenceText} + Per ${pairRank}`;
  }
  if (type === "bom") return `Boom ${cards[0].rank}`;
  if (type === "seri" || type === "piting") {
    const sequence = cards
      .slice()
      .sort((a, b) => rankValue(a.rank) - rankValue(b.rank))
      .map((card) => card.rank)
      .join(", ");
    return `${type === "seri" ? "Seri" : "Piting"} ${sequence}`;
  }
  return "permainan";
}

function playerLabel(playerId) {
  return playerId === 0 ? "Kamu" : `Bot ${playerId}`;
}

function renderPlayer(id) {
  const player = players[id];
  const label = id === 0 ? "Kamu" : `Bot ${id}`;
  const playerPositions = { 1: "south", 2: "north", 3: "west", 4: "east" };
  const finishPosition = finishOrder.indexOf(id);
  const finishedLabel =
    finishPosition >= 0 ? ` · selesai #${finishPosition + 1}` : "";
  const active =
    currentPlayer === id && started && !gameOver && !isFinished(id)
      ? " active"
      : "";
  const slot = seatSlots[id];
  const playerElement = $(`player-${slot}`);
  if (id === 0) {
    playerElement.hidden = true;
    playerElement.innerHTML = "";
    return;
  }
  playerElement.hidden = false;
  playerElement.className = `player ${playerPositions[slot]}${active}`;
  playerElement.innerHTML = `<h2>${label}${currentPlayer === id && started && !gameOver ? " · giliran" : ""}${finishedLabel}</h2>
        <p>${player.hand.length} kartu</p>
        <div class="back-row">${player.hand.map(() => '<span class="card back"></span>').join("")}</div>`;
}

function render() {
  if (!started) return;
  [0, 1, 2, 3].forEach(renderPlayer);
  $("human-hand").innerHTML = players[0].hand
    .map((card) => cardHtml(card, true))
    .join("");
  const discardCard = $("discard-card");
  const tableGroups = [
    ...(showOpeningThrees && openingThrees.length ? [openingThrees] : []),
    ...playedGroups,
  ];
  const latestGroupIndex = tableGroups.length - 1;
  discardCard.className = tableGroups.length
    ? "discard-zone"
    : "discard-zone empty";
  discardCard.innerHTML = tableGroups.length
    ? tableGroups
        .flatMap((group, groupIndex) =>
          group.map((card, index) => {
            const groupOffset =
              groupIndex === latestGroupIndex ? 0 : groupIndex % 2 ? -24 : 24;
            return cardHtml(
              card,
              false,
              index,
              group.length,
              groupOffset,
              groupIndex,
            );
          }),
        )
        .join("")
    : "";
  $("last-play-label").textContent = currentPlay
    ? `${playDescription(currentPlay.cards)}, ${playerLabel(lastPlayPlayer)}`
    : lastPlayedCards.length
      ? `${playDescription(lastPlayedCards)}, ${playerLabel(lastPlayPlayer)}`
      : showOpeningThrees && openingThrees.length
        ? "3 pembuka"
        : "Belum ada permainan";
  $("new-game").textContent = nextRoundAvailable
    ? `Mulai Babak ${round + 1}`
    : "Permainan Baru";
  $("play-button").disabled =
    dealing || currentPlayer !== 0 || gameOver || !canPlay(getSelectedCards());
  const mustAnswerTwo =
    currentPlay &&
    currentPlay.cards.some((card) => card.rank === "2") &&
    currentPlayer !== lastPlayPlayer;
  $("pass-button").disabled =
    dealing ||
    currentPlayer !== 0 ||
    gameOver ||
    !currentPlay ||
    (freeWay && !mustAnswerTwo);
  document.querySelectorAll("[data-card-id]").forEach((element) => {
    element.addEventListener("click", () => selectCard(element.dataset.cardId));
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ")
        selectCard(element.dataset.cardId);
    });
  });
}

function selectCard(id) {
  if (dealing || currentPlayer !== 0 || gameOver) return;
  selectedCards = selectedCards.includes(id)
    ? selectedCards.filter((cardId) => cardId !== id)
    : [...selectedCards, id];
  render();
}

function setStatus(message) {
  $("status").textContent = message;
}

function playMusicNote(frequency, startTime, duration) {
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.025, startTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.05);
}

function playDealSound(delay) {
  if (!audioContext || !musicEnabled) return;
  const startTime = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(720, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(360, startTime + 0.07);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.045, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08);
  oscillator.connect(gain).connect(audioContext.destination);
  const source = { oscillator, stopped: false };
  dealAudioSources.add(source);
  oscillator.addEventListener(
    "ended",
    () => dealAudioSources.delete(source),
    { once: true },
  );
  oscillator.start(startTime);
  oscillator.stop(startTime + 0.1);
}

function stopDealSounds() {
  dealAudioSources.forEach((source) => {
    if (!source.stopped) {
      source.stopped = true;
      source.oscillator.stop();
    }
    source.oscillator.disconnect();
  });
  dealAudioSources.clear();
}

function scheduleBackgroundMusic() {
  if (!musicEnabled || musicTimer || !audioContext) return;
  const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
  const playLoop = () => {
    if (!musicEnabled || !audioContext) {
      musicTimer = null;
      return;
    }
    const startTime = audioContext.currentTime + 0.05;
    melody.forEach((note, index) =>
      playMusicNote(note, startTime + index * 0.42, 0.34),
    );
    musicTimer = window.setTimeout(playLoop, melody.length * 420);
  };
  playLoop();
}

function startBackgroundMusic() {
  if (!musicEnabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audioContext = audioContext || new AudioContext();
  if (audioContext.state === "suspended") {
    audioContext
      .resume()
      .then(() => {
        if (!musicTimer) scheduleBackgroundMusic();
      })
      .catch(() => {
        setStatus("Klik halaman sekali untuk mengaktifkan backsound.");
      });
    return;
  }
  if (!musicTimer) scheduleBackgroundMusic();
}

function beginInitialGame(event) {
  if (started || initialStartPending) {
    if (started) startBackgroundMusic();
    return;
  }
  initialStartPending = true;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    deal();
    return;
  }
  audioContext = audioContext || new AudioContext();
  const begin = () => {
    if (started) return;
    startBackgroundMusic();
    deal();
    initialGameJustStarted =
      event && event.target && event.target.id === "new-game";
  };
  if (audioContext.state === "suspended") {
    audioContext
      .resume()
      .then(begin)
      .catch(() => {
        setStatus(
          "Audio diblokir browser. Klik halaman sekali lagi untuk memulai.",
        );
        initialStartPending = false;
      });
  } else {
    begin();
  }
}

function stopBackgroundMusic() {
  if (musicTimer) {
    window.clearTimeout(musicTimer);
    musicTimer = null;
  }
  if (audioContext && audioContext.state === "running") audioContext.suspend();
}

function spokenRank(rank) {
  return (
    {
      A: "as",
      2: "dua",
      3: "tiga",
      4: "empat",
      5: "lima",
      6: "enam",
      7: "tujuh",
      8: "delapan",
      9: "sembilan",
      10: "sepuluh",
      J: "jack",
      Q: "queen",
      K: "king",
    }[rank] || rank
  );
}

function spokenPlayDescription(cards) {
  const type = playType(cards);
  if (type === "tunggal") return spokenRank(cards[0].rank);
  if (type === "per") return `per ${spokenRank(cards[0].rank)}`;
  if (type === "tris") return `tris ${spokenRank(cards[0].rank)}`;
  if (type === "fullHouse") {
    const triple = cards.find(
      (card) =>
        cards.filter((candidate) => candidate.rank === card.rank).length === 3,
    );
    return `polo ${spokenRank(triple.rank)}`;
  }
  if (type === "bom") return `boom ${spokenRank(cards[0].rank)}`;
  if (type === "seri" || type === "piting") {
    return `${type === "seri" ? "seri" : "piting"} ${cards
      .slice()
      .sort((a, b) => rankValue(a.rank) - rankValue(b.rank))
      .map((card) => spokenRank(card.rank))
      .join(" ")}`;
  }
  if (type === "poloSeri") {
    const { sequence } = getStraightPairParts(cards);
    const sequenceText = sequence
      .sort((a, b) => rankValue(a.rank) - rankValue(b.rank))
      .map((card) => spokenRank(card.rank))
      .join(" ");
    return `polo seri ${sequenceText}`;
  }
  return "";
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
      .find((voice) => /^id(?:-|_)/i.test(voice.lang));
    if (indonesianVoice) utterance.voice = indonesianVoice;
    utterance.rate = 0.85;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  };
  if (window.speechSynthesis.getVoices().length) {
    speak();
  } else {
    window.speechSynthesis.addEventListener("voiceschanged", speak, { once: true });
    window.setTimeout(speak, 300);
  }
}

function speakPlay(cards) {
  const phrase = spokenPlayDescription(cards);
  if (phrase) speakText(phrase);
}

function animateDeal(onComplete) {
  stopDealSounds();
  const source = $("discard-card").getBoundingClientRect();
  const sourceX = source.left + source.width / 2;
  const sourceY = source.top + source.height / 2;
  const dealTargets = [
    $("player-2"),
    $("player-3"),
    $("player-4"),
    $("human-hand"),
  ];
  const cards = [];
  for (let cardIndex = 0; cardIndex < 13; cardIndex++) {
    dealTargets.forEach((target) => {
      const card = target.querySelectorAll(".card")[cardIndex];
      if (card) cards.push(card);
    });
  }
  const dealStep = 105;
  const animationDuration = 780;
  const totalDuration = (cards.length - 1) * dealStep + animationDuration + 120;
  cards.forEach((card, index) => {
    const target = card.getBoundingClientRect();
    card.classList.add("deal-flying");
    card.style.setProperty(
      "--deal-x",
      `${sourceX - (target.left + target.width / 2)}px`,
    );
    card.style.setProperty(
      "--deal-y",
      `${sourceY - (target.top + target.height / 2)}px`,
    );
    card.style.animationDelay = `${index * dealStep}ms`;
    playDealSound((index * dealStep) / 1000);
  });
  const finish = () => {
    if (!dealAnimation || dealAnimation.finish !== finish) return;
    window.clearTimeout(dealAnimation.timer);
    cards.forEach((card) => {
      card.classList.remove("deal-flying");
      card.style.removeProperty("--deal-x");
      card.style.removeProperty("--deal-y");
      card.style.animationDelay = "";
    });
    dealAnimation = null;
    if (onComplete) onComplete();
  };
  dealAnimation = {
    finish,
    timer: window.setTimeout(finish, totalDuration),
  };
  return totalDuration;
}

function skipDealAnimation() {
  if (!dealing || !dealAnimation) return;
  stopDealSounds();
  dealAnimation.finish();
}

function collectOpeningThrees() {
  const openingPlays = players
    .map((player) => ({
      playerId: player.id,
      cards: player.hand.filter((card) => card.rank === "3"),
    }))
    .filter((play) => play.cards.length);
  const origins = openingPlays.map((play) => ({
    ...play,
    origin: playOrigin(play.playerId, play.cards),
  }));

  players.forEach((player) => {
    player.hand = player.hand.filter((card) => card.rank !== "3");
  });
  sortHumanHand();
  render();
  origins.forEach((play, index) => {
    window.setTimeout(
      () => animatePlay(play.cards, play.playerId, play.origin),
      index * 180,
    );
  });
  window.setTimeout(() => {
    showOpeningThrees = true;
    dealing = false;
    render();
  }, 1400);
}

function animateBomb(cards, targetPlayerId) {
  const origin = $("discard-card").getBoundingClientRect();
  const targetElement =
    targetPlayerId === 0
      ? $("human-hand")
      : $(`player-${seatSlots[targetPlayerId]}`);
  const target = targetElement.getBoundingClientRect();
  const targetX = target.left + target.width / 2 - 29;
  const targetY = target.top + target.height / 2 - 41;
  const impactElement = targetPlayerId === 0 ? $("human-hand") : targetElement;

  cards.forEach((card, index) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = cardHtml(card);
    const flightCard = wrapper.firstElementChild;
    flightCard.classList.add("bomb-flight");
    flightCard.style.left = `${origin.left + origin.width / 2 - 29 + index * 6}px`;
    flightCard.style.top = `${origin.top + origin.height / 2 - 41 + index * 5}px`;
    document.body.appendChild(flightCard);
    window.requestAnimationFrame(() => {
      flightCard.style.transform = `translate(${targetX - (origin.left + origin.width / 2 - 29) + index * 6}px, ${targetY - (origin.top + origin.height / 2 - 41) + index * 5}px) rotate(${index % 2 ? 18 : -18}deg)`;
      flightCard.style.opacity = "0.15";
    });
    window.setTimeout(() => flightCard.remove(), 850);
  });

  impactElement.classList.add("bomb-hit");
  window.setTimeout(() => impactElement.classList.remove("bomb-hit"), 700);
}

function playOrigin(playerId, cards) {
  if (playerId === 0) {
    const firstCard = $(`human-hand`).querySelector(
      `[data-card-id="${cards[0].id}"]`,
    );
    if (firstCard) {
      const rect = firstCard.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
  }
  const playerElement =
    playerId === 0 ? $("human-hand") : $(`player-${seatSlots[playerId]}`);
  const rect = playerElement.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function animatePlay(cards, playerId, origin) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const target = $("discard-card").getBoundingClientRect();
  const targetX = target.left + target.width / 2;
  const targetY = target.top + target.height / 2;

  cards.forEach((card, index) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = cardHtml(card);
    const flightCard = wrapper.firstElementChild;
    flightCard.classList.add("play-flight");
    document.body.appendChild(flightCard);
    const cardWidth = flightCard.offsetWidth;
    const cardHeight = flightCard.offsetHeight;
    const startX = origin.x - cardWidth / 2 + index * 6;
    const startY = origin.y - cardHeight / 2 + index * 4;
    const offsetX = targetX - startX - cardWidth / 2;
    const offsetY = targetY - startY - cardHeight / 2;
    flightCard.style.left = `${startX}px`;
    flightCard.style.top = `${startY}px`;
    flightCard.style.transform = `rotate(${index % 2 ? 8 : -8}deg)`;
    window.requestAnimationFrame(() => {
      flightCard.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${index % 2 ? 12 : -12}deg)`;
      flightCard.style.opacity = "0.15";
    });
    window.setTimeout(() => flightCard.remove(), 720);
  });
}

function playCards(playerId, cards) {
  const player = players[playerId];
  const type = playType(cards);
  if (!type || !canPlay(cards)) return false;
  const origin = playOrigin(playerId, cards);
  const wasTwo =
    currentPlay && currentPlay.cards.some((card) => card.rank === "2");
  const bombTarget = type === "bom" && wasTwo ? lastPlayPlayer : null;
  player.hand = player.hand.filter(
    (card) => !cards.some((played) => played.id === card.id),
  );
  currentPlay = { cards, type, rankValue: playRankValue(cards, type) };
  playedGroups.push(cards.slice());
  lastPlayedCards = cards.slice();
  lastPlayPlayer = playerId;
  passCount = 0;
  selectedCards = [];
  const finishedNow = player.hand.length === 0 && !isFinished(playerId);
  if (finishedNow) finishOrder.push(playerId);

  if (type !== "bom" && finishOrder.length === 3) {
    const lastPlayer = [0, 1, 2, 3].find((id) => !isFinished(id));
    finishOrder.push(lastPlayer);
    previousWinner = finishOrder[0];
    gameOver = true;
    nextRoundAvailable = true;
    currentPlayer = lastPlayer;
    setStatus(finishMessage());
    render();
    animatePlay(cards, playerId, origin);
    speakPlay(cards);
    return true;
  }

  if (cards.some((card) => card.rank === "2")) {
    freeWay = false;
    currentPlayer = nextActivePlayer(playerId);
    setStatus(
      `${playerId === 0 ? "Kamu" : `Bot ${playerId}`} mengeluarkan 2. Pemain lain hanya bisa melawan dengan bom atau pass.`,
    );
  } else {
    freeWay = false;
    currentPlayer = nextActivePlayer(playerId);
  }
  if (type === "bom") {
    gameOver = true;
    nextRoundAvailable = false;
    setStatus(
      wasTwo
        ? `${playerId === 0 ? "Kamu" : `Bot ${playerId}`} mengeluarkan bom setelah angka 2. Kembali ke permainan baru.`
        : `${playerId === 0 ? "Kamu" : `Bot ${playerId}`} mengeluarkan bom. Game langsung selesai!`,
    );
  } else if (finishedNow) {
    setStatus(
      `${playerId === 0 ? "Kamu" : `Bot ${playerId}`} habis kartu dan mendapat peringkat #${finishOrder.length}. Permainan dilanjutkan.`,
    );
  }
  render();
  animatePlay(cards, playerId, origin);
  speakPlay(cards);
  if (bombTarget !== null) animateBomb(cards, bombTarget);
  return true;
}

function playHumanCards() {
  const cards = getSelectedCards();
  if (dealing || currentPlayer !== 0 || !canPlay(cards)) {
    setStatus(
      "Kartu tidak valid. Pilih kombinasi yang sesuai aturan dan harus mengalahkan permainan terakhir.",
    );
    return;
  }
  if (!playCards(0, cards)) return;
  if (!gameOver) {
    setStatus(
      isFinished(0)
        ? `Kamu habis kartu dan mendapat peringkat #${finishOrder.length}. Permainan dilanjutkan.`
        : freeWay
          ? "Kamu mendapat giliran. Pilih permainan berikutnya."
          : `Kamu mengeluarkan ${playDescription(cards)}. Bot ${currentPlayer} akan bermain.`,
    );
    if (currentPlayer !== 0) window.setTimeout(botTurn, 1000);
  }
}

function passHuman() {
  const mustAnswerTwo =
    currentPlay &&
    currentPlay.cards.some((card) => card.rank === "2") &&
    currentPlayer !== lastPlayPlayer;
  if (
    dealing ||
    currentPlayer !== 0 ||
    !currentPlay ||
    (freeWay && !mustAnswerTwo)
  )
    return;
  passTurn(0);
}

function passTurn(playerId) {
  speakText("pass");
  passCount++;
  const activePlayers = 4 - finishOrder.length;
  if (passCount >= activePlayers - 1) {
    currentPlayer = isFinished(lastPlayPlayer)
      ? nextActivePlayer(lastPlayPlayer)
      : lastPlayPlayer;
    currentPlay = null;
    freeWay = true;
    passCount = 0;
    render();
    setStatus("Semua pemain lain pass. Pemain terakhir mendapat giliran.");
    if (currentPlayer !== 0) window.setTimeout(botTurn, 1000);
    return;
  }
  currentPlayer = nextActivePlayer(playerId);
  render();
  if (currentPlayer === 0) {
    setStatus(
      "Giliranmu. Lawan dengan jumlah kartu yang sama atau pilih pass.",
    );
  } else {
    window.setTimeout(botTurn, 1000);
  }
}

function combinations(cards, size, start = 0, picked = []) {
  if (picked.length === size) return [picked];
  const results = [];
  for (
    let index = start;
    index <= cards.length - (size - picked.length);
    index++
  ) {
    results.push(
      ...combinations(cards, size, index + 1, [...picked, cards[index]]),
    );
  }
  return results;
}

function moveRisk(cards) {
  const twos = cards.filter((card) => card.rank === "2").length;
  const highCards = cards.filter((card) =>
    ["K", "A"].includes(card.rank),
  ).length;
  return twos * 420 + highCards * 110 + playRankValue(cards);
}

function hasRiskyCard(cards) {
  return cards.some(
    (card) => card.rank === "2" || ["K", "A"].includes(card.rank),
  );
}

function findBotPlay(bot) {
  const hand = bot.hand
    .slice()
    .sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
  if (
    currentPlay &&
    currentPlay.cards.some((card) => card.rank === "2") &&
    currentPlayer !== lastPlayPlayer
  ) {
    const bombs = combinations(hand, 4)
      .filter((cards) => playType(cards) === "bom")
      .sort((a, b) => moveRisk(a) - moveRisk(b));
    if (bombs.length) return bombs[0];
    return null;
  }
  if (freeWay || !currentPlay) {
    const freeCandidates = [5, 4, 3, 2, 1]
      .flatMap((size) => combinations(hand, size))
      .filter((cards) => playType(cards))
      .sort(
        (a, b) =>
          (5 - a.length) * 150 +
          moveRisk(a) -
          ((5 - b.length) * 150 + moveRisk(b)),
      );
    if (difficulty === "easy" && freeCandidates.length > 1) {
      return freeCandidates[
        Math.floor(Math.random() * Math.min(freeCandidates.length, 6))
      ];
    }
    return freeCandidates[0] || null;
  }

  const sizes = [currentPlay.cards.length];
  if (currentPlay.cards.some((card) => card.rank === "2")) sizes.push(4, 5);
  const candidates = sizes
    .flatMap((size) => combinations(hand, size))
    .filter((cards) => canPlay(cards))
    .sort((a, b) => moveRisk(a) - moveRisk(b));
  if (difficulty === "easy" && candidates.length > 1) {
    return candidates[
      Math.floor(Math.random() * Math.min(candidates.length, 3))
    ];
  }
  return candidates[0] || null;
}

function botTurn() {
  if (currentPlayer === 0 || gameOver) return;
  if (isFinished(currentPlayer)) {
    currentPlayer = nextActivePlayer(currentPlayer);
    window.setTimeout(botTurn, 0);
    return;
  }
  const botNumber = currentPlayer;
  const cards = findBotPlay(players[botNumber]);
  if (
    cards &&
    !freeWay &&
    hasRiskyCard(cards) &&
    Math.random() < hesitationChance[difficulty]
  ) {
    passTurn(botNumber);
    return;
  }
  if (cards && canPlay(cards)) {
    playCards(botNumber, cards);
    if (!gameOver) {
      setStatus(
        freeWay
          ? `Bot ${botNumber} mengeluarkan ${playDescription(cards)}. Giliran Bot ${botNumber}.`
          : currentPlayer === 0
            ? `Bot ${botNumber} mengeluarkan ${playDescription(cards)}. Giliranmu.`
            : `Bot ${botNumber} mengeluarkan ${playDescription(cards)}. Giliran Bot ${currentPlayer}.`,
      );
    }
    if (!gameOver && currentPlayer !== 0) {
      window.setTimeout(botTurn, 1000);
    }
  } else {
    passTurn(botNumber);
  }
}

$("new-game").addEventListener("click", handleNewGame);
$("music-toggle").addEventListener("click", () => {
  musicEnabled = !musicEnabled;
  $("music-toggle").textContent = `Musik: ${musicEnabled ? "Nyala" : "Mati"}`;
  $("music-toggle").setAttribute("aria-pressed", String(musicEnabled));
  if (musicEnabled) startBackgroundMusic();
  else stopBackgroundMusic();
});
$("difficulty").addEventListener("change", (event) => {
  difficulty = event.target.value;
  setStatus(`Tingkat kesulitan diubah ke ${difficultyNames[difficulty]}.`);
});
$("next-bonus").addEventListener("change", (event) => {
  nextBonus = event.target.value;
  setStatus(
    nextBonus === "none"
      ? "Bonus pertandingan berikutnya dimatikan."
      : `${bonusNames[nextBonus]} akan diberikan pada pertandingan berikutnya.`,
  );
});
$("play-button").addEventListener("click", playHumanCards);
$("pass-button").addEventListener("click", passHuman);
document.addEventListener("pointerdown", beginInitialGame, true);
document.addEventListener("dblclick", skipDealAnimation);
document.addEventListener("click", (event) => {
  startBackgroundMusic();
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  const ripple = document.createElement("span");
  const bounds = button.getBoundingClientRect();
  ripple.className = "ripple";
  ripple.style.left = `${event.clientX - bounds.left - 6}px`;
  ripple.style.top = `${event.clientY - bounds.top - 6}px`;
  button.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 600);
});
$("status").textContent = "Klik halaman untuk memulai permainan.";
