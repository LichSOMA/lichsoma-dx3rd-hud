/**
 * DX3rd Carousel Combat Tracker
 * Carousel 스타일의 전투 추적기를 구현합니다.
 */

const MODULE_ID = "lichsoma-dx3rd-hud";

// Haste로 인한 action_end 해제 추적 (깜빡임 방지)
let hasteActionEndUpdateInProgress = false;

Hooks.once('init', async function() {
  registerTurnHighlightSettings();
});

Hooks.once('ready', async function() {
  createCombatTracker();
});

// Combat 생성 시
Hooks.on('createCombat', () => {
  createCombatTracker();
});

// Combat 삭제 시
Hooks.on('deleteCombat', () => {
  removeCombatTracker();
  removeAllTurnHighlights();
});

// Combat 시작 시
Hooks.on('combatStart', () => {
  // 약간의 딜레이 후 턴 강조 업데이트 (토큰이 준비될 시간 확보)
  setTimeout(() => {
    updateTurnHighlight();
  }, 100);
});

// Combat 시작/업데이트 시 (이니셔티브 변경 포함)
// Combatant 추가/제거 시에도 호출됨
let combatUpdateTimeout = null;
Hooks.on('updateCombat', (combat, changes, options, userId) => {
  // combatant 관련 변경이 있는 경우에만 업데이트
  if (combat && combat.started) {
    // Haste로 인한 action_end 해제 중이면 updateCombat 훅 스킵 (깜빡임 방지)
    if (hasteActionEndUpdateInProgress) {
      return;
    }
    
    // debounce: 연속된 업데이트를 하나로 묶어서 처리
    if (combatUpdateTimeout) {
      clearTimeout(combatUpdateTimeout);
    }
    combatUpdateTimeout = setTimeout(() => {
      createCombatTracker();
      combatUpdateTimeout = null;
    }, 50);
  }
});

// Combatant 추가 시
Hooks.on('createCombatant', (combatant, options, userId) => {
  const actor = combatant.actor;
  
  // Haste 아이템 보유 여부 확인 (플래그를 먼저 설정하여 updateCombat 훅이 스킵되도록)
  let hasHaste = false;
  if (actor) {
    const hasteItemName = game.i18n.localize('DX3rdHUD.Item.Haste');
    hasHaste = actor.items.some(item => item.name === hasteItemName);
    
    // Haste 아이템이 있으면 즉시 플래그 설정 (updateCombat 훅이 호출되기 전에)
    if (hasHaste) {
      hasteActionEndUpdateInProgress = true;
    }
  }
  
  if (hasHaste) {
    // Haste 아이템이 있는 경우: action_end를 먼저 해제한 후 트랙커 업데이트
    setTimeout(async () => {
      if (!game.combat || !game.combat.started) {
        hasteActionEndUpdateInProgress = false;
        return;
      }
      
      const currentCombatant = game.combat.combatants.get(combatant.id);
      if (!currentCombatant) {
        hasteActionEndUpdateInProgress = false;
        return;
      }
      
      const currentActor = currentCombatant.actor;
      if (!currentActor) {
        hasteActionEndUpdateInProgress = false;
        return;
      }
      
      // action_end가 활성화되어 있는지 확인
      const actionEndActive = currentActor.system?.conditions?.action_end?.active ?? false;
      
      if (actionEndActive) {
        // action_end 해제
        await currentActor.update({
          'system.conditions.action_end.active': false
        });
        
        // action_end 해제 후 이니셔티브 재계산 완료 대기
        // updateCombat 훅이 호출되지만 플래그로 인해 스킵됨
        setTimeout(() => {
          if (game.combat && game.combat.started) {
            createCombatTracker();
            hasteActionEndUpdateInProgress = false; // 플래그 리셋
          } else {
            hasteActionEndUpdateInProgress = false;
          }
        }, 150);
      } else {
        // action_end가 이미 해제되어 있으면 플래그만 리셋
        hasteActionEndUpdateInProgress = false;
      }
    }, 50);
  } else {
    // Haste 아이템이 없는 경우: 기존대로 트랙커만 업데이트
    if (game.combat && game.combat.started) {
      setTimeout(() => {
        if (game.combat && game.combat.started) {
          createCombatTracker();
        }
      }, 50);
    }
  }
});

// Combatant 제거 시
Hooks.on('deleteCombatant', (combatant, options, userId) => {
  if (game.combat && game.combat.started) {
    // 약간의 딜레이를 두어 combatant가 완전히 제거된 후 업데이트
    // updateCombat 훅도 호출되지만, 확실하게 하기 위해 여기서도 처리
    setTimeout(() => {
      if (game.combat && game.combat.started) {
        createCombatTracker();
      }
    }, 150);
  }
});

// 토큰 삭제 시 (토큰이 삭제되면 연결된 combatant도 제거되므로 트랙커 업데이트)
Hooks.on('deleteToken', (tokenDoc, options, userId) => {
  if (game.combat && game.combat.started) {
    // 토큰 삭제 후 combatant가 제거되는 것을 고려하여 딜레이 추가
    setTimeout(() => {
      if (game.combat && game.combat.started) {
        createCombatTracker();
      }
    }, 100);
  }
});

// 액터 HP 변경 시 (HP 0이 되면 carousel에서 제거)
// 액터 action_end.active 변경 시 (그레이스케일 업데이트)
Hooks.on('updateActor', (actor, changes) => {
  // HP가 변경되었는지 확인
  const hpChanged = changes.system?.attributes?.hp?.value !== undefined;
  // action_end.active가 변경되었는지 확인
  const actionEndChanged = changes.system?.conditions?.action_end?.active !== undefined;
  
  if (hpChanged || actionEndChanged) {
    // Haste로 인한 action_end 해제 중이면 updateActor 훅 스킵 (깜빡임 방지)
    if (hasteActionEndUpdateInProgress && actionEndChanged) {
      return;
    }
    
    // 현재 전투가 진행 중이고 해당 액터가 combatant인 경우에만 업데이트
    if (game.combat && game.combat.started) {
      const isInCombat = game.combat.combatants.find(c => c.actor?.id === actor.id);
      if (isInCombat) {
        createCombatTracker();
      }
    }
  }
});

// Combat 턴 변경 시
Hooks.on('combatTurn', () => {
  createCombatTracker();
  updateTurnHighlight();
});

// Combat 업데이트 시 턴 변경 감지
Hooks.on('updateCombat', (combat, changes) => {
  if ('turn' in changes) {
    updateTurnHighlight();
    // 턴이 변경되면 비활성 알림 초기화
    resetInactivityTracking();
  }
});

// 캔버스 준비 시 턴 강조 복원 (새로고침 대응)
Hooks.on('canvasReady', () => {
  // 약간의 딜레이를 두고 턴 강조 복원 (토큰이 완전히 로드될 때까지 대기)
  setTimeout(() => {
    if (game.combat && game.combat.started) {
      updateTurnHighlight();
    }
  }, 200);
});

// 토큰 리프레시 시 턴 강조 레이어 재부착
Hooks.on('refreshToken', (token) => {
  try {
    if (token._dx3rdTurnHighlightLayer && !token.children.includes(token._dx3rdTurnHighlightLayer)) {
      // 설정에서 위치 가져오기
      const position = game.settings.get(MODULE_ID, "turnHighlightPosition") || "below";
      
      if (position === "below") {
        // 레이어를 맨 앞에 추가하여 뒤에 배치되도록
        token.addChildAt(token._dx3rdTurnHighlightLayer, 0);
      } else {
        // 레이어를 맨 뒤에 추가하여 위에 배치되도록
        token.addChild(token._dx3rdTurnHighlightLayer);
      }
    }
  } catch (e) {
  }
});

// 행동 종료 감지 및 소켓 통신
Hooks.once('ready', () => {
  // 소켓 리스너 등록 (모든 유저)
  game.socket.on(`module.${MODULE_ID}`, (data) => {
    if (data.type === 'removeTurnHighlight') {
      // 모든 유저가 턴 강조 제거
      removeAllTurnHighlights();
    } else if (data.type === 'requestRemoveTurnHighlight' && game.user.isGM) {
      // GM도 먼저 로컬에서 제거 (자신이 보낸 메시지는 받지 않으므로)
      removeAllTurnHighlights();
      // GM만: 일반 유저의 요청을 받으면 모든 유저에게 브로드캐스트
      game.socket.emit(`module.${MODULE_ID}`, {
        type: 'removeTurnHighlight'
      });
    } else if (data.type === 'playTurnNotification') {
      // 턴 알림 사운드 재생 (GM 제외, 자신의 ID와 일치하는 경우만)
      if (!game.user.isGM && data.userId === game.user.id) {
        const soundPath = game.settings.get(MODULE_ID, "turnNotificationSound");
        const soundVolume = game.settings.get(MODULE_ID, "turnNotificationSoundVolume");
        if (soundPath) {
          AudioHelper.play({
            src: soundPath,
            volume: soundVolume,
            autoplay: true,
            loop: false
          }, false);
        }
        
        // 메시지가 설정되어 있으면 화면에 표시
        const message = data.message;
        if (message && message.trim() !== "") {
          showTurnNotificationMessage(message);
        }
      }
    } else if (data.type === 'playerInactive' && game.user.isGM) {
      // GM에게 플레이어 비활성 알림
      showPlayerInactiveNotification(data.userName, data.actorName);
    } else if (data.type === 'playerActive' && game.user.isGM) {
      // GM에게 플레이어 활성 알림 (비활성 알림 제거)
      hidePlayerInactiveNotification();
    }
  });
  
  // 마우스 활동 추적 시작
  startMouseActivityTracking();
  
  // GM용 휴면 감지 시작
  if (game.user.isGM) {
    startGMInactivityMonitoring();
  }
  
  // 이벤트 위임 방식으로 버튼 클릭 감지
  document.body.addEventListener('click', (e) => {
    // "행동 종료" 버튼 클릭 감지
    if (e.target && e.target.id === 'dx3rd-end-action-button') {
      // 로컬에서 먼저 제거
      removeAllTurnHighlights();
      
      // 소켓 통신
      if (game.user.isGM) {
        // GM이면 모든 유저에게 브로드캐스트
        game.socket.emit(`module.${MODULE_ID}`, {
          type: 'removeTurnHighlight'
        });
      } else {
        // 일반 유저면 GM에게 요청
        game.socket.emit(`module.${MODULE_ID}`, {
          type: 'requestRemoveTurnHighlight'
        });
      }
    }
  });
});

// ChatMessage 생성 시 "행동 종료" 메시지 감지 (백업 방법)
Hooks.on('chatMessage', (message) => {
  // "행동 종료" 메시지인지 확인
  const actionEndText = game.i18n.localize("DX3rd.ActionEnd");
  if (message.content && message.content.includes(actionEndText)) {
    // 로컬에서 먼저 제거
    removeAllTurnHighlights();
    
    // 소켓 통신
    if (game.user.isGM) {
      // GM이면 모든 유저에게 브로드캐스트
      game.socket.emit(`module.${MODULE_ID}`, {
        type: 'removeTurnHighlight'
      });
    } else {
      // 일반 유저면 GM에게 요청
      game.socket.emit(`module.${MODULE_ID}`, {
        type: 'requestRemoveTurnHighlight'
      });
    }
  }
});

/**
 * Combat Tracker 컨테이너 생성
 */
function createCombatTracker() {
  // Combat이 없으면 컨테이너 제거하고 종료
  if (!game.combat) {
    removeCombatTracker();
    return;
  }

  const uiBottom = document.getElementById('ui-bottom');
  if (!uiBottom) {
    return;
  }

  // 기존 컨테이너가 있으면 제거
  const existing = document.getElementById('dx3rd-combat-tracker');
  if (existing) {
    existing.remove();
  }

  // Combat Tracker 컨테이너 생성
  const container = document.createElement('div');
  container.id = 'dx3rd-combat-tracker';
  container.className = 'dx3rd-combat-tracker';
  
  // 컨테이너 너비는 나중에 displayCount에 따라 설정됨
  
  // Combat 상태에 따른 콘텐츠
  if (!game.combat.started) {
    // 전투가 시작되지 않았을 때
    const readyText = game.i18n.localize("DX3rdHUD.CombatReady");
    container.innerHTML = `
      <div class="combat-tracker-content">
        <div class="combat-ready-wrapper">
          <i class="fa-solid fa-triangle-exclamation combat-ready-icon"></i>
          <div class="combat-ready-message">${readyText}</div>
        </div>
      </div>
    `;
    
    // 기본 너비 설정
    container.style.width = '300px';
    
    // 클릭 이벤트 추가 (전투 시작) - wrapper 전체 클릭 가능
    const readyWrapper = container.querySelector('.combat-ready-wrapper');
    if (readyWrapper) {
      readyWrapper.addEventListener('click', async () => {
        if (game.user.isGM) {
          await game.combat.startCombat();
        }
      });
    }
    
    // 전투 삭제 버튼 추가 (GM만)
    if (game.user.isGM) {
      addDeleteCombatButton(container);
    }
  } else {
    // 전투가 시작되었을 때 - 라운드 표시 추가
    const roundText = game.i18n.localize("DX3rdHUD.Round");
    const currentRound = game.combat.round || 1;
    container.innerHTML = `
      <div class="combat-round-display">${roundText} ${currentRound}</div>
    `;
    
    // Carousel 렌더링 (컨테이너 너비 자동 설정)
    renderCarousel(container);
    
    // 컨트롤 버튼 추가
    addControlButtons(container);
  }

  uiBottom.appendChild(container);
  
  // 핫바 높이에 따라 위치 설정
  updateTrackerPosition(container);
  
  // 핫바 크기 변경 감지 (접기/펼치기 대응)
  setupHotbarObserver(container);
  
  // 카드 더블클릭 이벤트 추가 (전투 시작 후에만)
  if (game.combat.started) {
    addCardClickEvents(container);
  }
}

/**
 * 전투 종료 확인 다이얼로그 HTML 템플릿 생성
 */
function createCombatEndDialogHTML() {
  const message = game.i18n.localize('DX3rdHUD.CombatEnd.Message');
  const yesLabel = game.i18n.localize('DX3rdHUD.CombatEnd.Yes');
  const noLabel = game.i18n.localize('DX3rdHUD.CombatEnd.No');
  
  return `
    <p class="combat-end-dialog-message">${message}</p>
    <div class="combat-end-dialog-buttons">
      <button class="combat-end-dialog-button combat-confirm-yes">${yesLabel}</button>
      <button class="combat-end-dialog-button combat-confirm-no">${noLabel}</button>
    </div>
  `;
}

/**
 * 전투 삭제 확인 다이얼로그 HTML 템플릿 생성
 */
function createCombatDeleteDialogHTML() {
  const message = game.i18n.localize('DX3rdHUD.CombatDelete.Message');
  const yesLabel = game.i18n.localize('DX3rdHUD.CombatDelete.Yes');
  const noLabel = game.i18n.localize('DX3rdHUD.CombatDelete.No');
  
  return `
    <p class="combat-end-dialog-message">${message}</p>
    <div class="combat-end-dialog-buttons">
      <button class="combat-end-dialog-button combat-confirm-yes">${yesLabel}</button>
      <button class="combat-end-dialog-button combat-confirm-no">${noLabel}</button>
    </div>
  `;
}

/**
 * 전투 종료 확인 다이얼로그 표시
 */
function showCombatEndDialog() {
  return new Promise((resolve) => {
    // 배경 오버레이 생성
    const overlay = document.createElement('div');
    overlay.className = 'combat-end-dialog-overlay';
    
    // 다이얼로그 박스 생성
    const dialogBox = document.createElement('div');
    dialogBox.className = 'combat-end-dialog-box';
    dialogBox.innerHTML = createCombatEndDialogHTML();
    
    overlay.appendChild(dialogBox);
    document.body.appendChild(overlay);
    
    // 버튼 이벤트
    const yesBtn = dialogBox.querySelector('.combat-confirm-yes');
    const noBtn = dialogBox.querySelector('.combat-confirm-no');
    
    const cleanup = () => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      document.removeEventListener('keydown', escHandler);
    };
    
    yesBtn.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });
    
    noBtn.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    });
    
    // ESC 키로 닫기
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        resolve(false);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

/**
 * 전투 삭제 확인 다이얼로그 표시
 */
function showCombatDeleteDialog() {
  return new Promise((resolve) => {
    // 배경 오버레이 생성
    const overlay = document.createElement('div');
    overlay.className = 'combat-end-dialog-overlay';
    
    // 다이얼로그 박스 생성
    const dialogBox = document.createElement('div');
    dialogBox.className = 'combat-end-dialog-box';
    dialogBox.innerHTML = createCombatDeleteDialogHTML();
    
    overlay.appendChild(dialogBox);
    document.body.appendChild(overlay);
    
    // 버튼 이벤트
    const yesBtn = dialogBox.querySelector('.combat-confirm-yes');
    const noBtn = dialogBox.querySelector('.combat-confirm-no');
    
    const cleanup = () => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      document.removeEventListener('keydown', escHandler);
    };
    
    yesBtn.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });
    
    noBtn.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(false);
      }
    });
    
    // ESC 키로 닫기
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        resolve(false);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

/**
 * 전투 삭제 버튼 추가 (GM만, combat-ready 상태용)
 */
function addDeleteCombatButton(container) {
  // GM이 아니면 버튼 추가 안 함
  if (!game.user.isGM) return;
  
  // 전투 삭제 버튼 (오른쪽 상단)
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'combat-control-btn delete-combat-btn';
  deleteBtn.innerHTML = '<i class="fa-solid fa-ban"></i>';
  deleteBtn.title = game.i18n.localize('DX3rdHUD.CombatDelete.Title');
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation(); // combat-ready-wrapper 클릭 이벤트 전파 방지
    if (game.combat) {
      const confirmed = await showCombatDeleteDialog();
      if (confirmed) {
        await game.combat.delete();
      }
    }
  });
  
  container.appendChild(deleteBtn);
}

/**
 * 컨트롤 버튼 추가 (GM만)
 */
function addControlButtons(container) {
  // GM이 아니면 버튼 추가 안 함
  if (!game.user.isGM) return;
  
  // Previous Turn 버튼 (왼쪽 하단)
  const prevBtn = document.createElement('button');
  prevBtn.className = 'combat-control-btn prev-turn-btn';
  prevBtn.innerHTML = '<i class="fa-solid fa-caret-left"></i>';
  prevBtn.title = 'Previous Turn';
  prevBtn.addEventListener('click', async () => {
    if (game.combat) {
      await game.combat.previousTurn();
    }
  });
  
  // Next Turn 버튼 (오른쪽 하단)
  const nextBtn = document.createElement('button');
  nextBtn.className = 'combat-control-btn next-turn-btn';
  nextBtn.innerHTML = '<i class="fa-solid fa-caret-right"></i>';
  nextBtn.title = 'Next Turn';
  nextBtn.addEventListener('click', async () => {
    if (game.combat) {
      await game.combat.nextTurn();
    }
  });
  
  // 전투 종료 버튼 (오른쪽 상단)
  const endBtn = document.createElement('button');
  endBtn.className = 'combat-control-btn end-combat-btn';
  endBtn.innerHTML = '<i class="fa-solid fa-ban"></i>';
  endBtn.title = 'End Combat';
  endBtn.addEventListener('click', async () => {
    if (game.combat) {
      const confirmed = await showCombatEndDialog();
      if (confirmed) {
        await game.combat.delete();
      }
    }
  });
  
  container.appendChild(prevBtn);
  container.appendChild(nextBtn);
  container.appendChild(endBtn);
}

/**
 * Carousel 렌더링
 */
function renderCarousel(container) {
  const combat = game.combat;
  if (!combat || !combat.started) return;

  // HP 0 이하인 액터는 제외, 프로세스 combatant는 포함, 토큰이 없는 combatant는 제외
  const visibleCombatants = combat.turns.filter(c => {
    const isProcess = c.getFlag('double-cross-3rd', 'isProcessCombatant');
    // 프로세스 combatant는 항상 포함
    if (isProcess) return true;
    
    // 일반 액터는 토큰과 HP 확인
    const actor = c.actor;
    if (!actor) return false;
    
    // 토큰이 없으면 제외 (토큰이 삭제된 경우)
    if (!c.token) return false;
    
    const currentHP = actor.system?.attributes?.hp?.value ?? 0;
    return currentHP > 0;
  });

  if (visibleCombatants.length === 0) {
    // 빈 carousel 표시 (라운드는 이미 표시되어 있음)
    return;
  }

  // 현재 턴의 인덱스 찾기
  const currentCombatant = combat.combatant;
  let currentIndex = visibleCombatants.findIndex(c => c.id === currentCombatant?.id);
  
  // 현재 combatant를 찾지 못한 경우 첫 번째 선택
  if (currentIndex === -1) {
    currentIndex = 0;
  }

  // 레이아웃 슬롯 수 결정 (설정에 따라 동적으로 결정)
  const totalCombatants = visibleCombatants.length;
  const maxSlots = Number(game.settings.get(MODULE_ID, "carouselMaxSlots"));
  let displayCount;
  
  if (maxSlots === 3) {
    // 최대 3칸: 1~3개면 3칸
    displayCount = 3;
  } else if (maxSlots === 5) {
    // 최대 5칸: 1~3개면 3칸, 4~5개면 5칸
    if (totalCombatants <= 3) {
      displayCount = 3;
    } else {
      displayCount = 5;
    }
  } else if (maxSlots === 7) {
    // 최대 7칸: 1~3개면 3칸, 4~5개면 5칸, 6개 이상이면 7칸
    if (totalCombatants <= 3) {
      displayCount = 3;
    } else if (totalCombatants <= 5) {
      displayCount = 5;
    } else {
      displayCount = 7;
    }
  } else if (maxSlots === 9) {
    // 최대 9칸: 1~3개면 3칸, 4~5개면 5칸, 6~7개면 7칸, 8개 이상이면 9칸
    if (totalCombatants <= 3) {
      displayCount = 3;
    } else if (totalCombatants <= 5) {
      displayCount = 5;
    } else if (totalCombatants <= 7) {
      displayCount = 7;
    } else {
      displayCount = 9;
    }
  } else {
    // 기본값 (7칸)
    if (totalCombatants <= 3) {
      displayCount = 3;
    } else if (totalCombatants <= 5) {
      displayCount = 5;
    } else {
      displayCount = 7;
    }
  }
  
  // 중앙 기준 양쪽 개수 계산
  const sideCount = Math.floor((displayCount - 1) / 2);
  
  // 카드 데이터 준비
  const cardsData = [];
  for (let offset = -sideCount; offset <= sideCount; offset++) {
    let index = currentIndex + offset;
    // 순환 처리
    while (index < 0) index += visibleCombatants.length;
    index = index % visibleCombatants.length;
    
    const combatant = visibleCombatants[index];
    
    // 동적 투명도 계산 (중앙에서 멀어질수록 투명)
    let opacity;
    const absOffset = Math.abs(offset);
    if (absOffset === 0) {
      opacity = 1; // 중앙
    } else if (absOffset === 1) {
      opacity = 0.85; // 중앙 양옆
    } else if (absOffset === 2) {
      opacity = 0.70; // 그 다음
    } else if (absOffset === 3) {
      opacity = 0.55; // 그 다음
    } else {
      opacity = 0.4; // 가장 바깥쪽 (9칸일 때)
    }
    
    cardsData.push({
      combatant,
      offset,
      opacity
    });
  }

  // Carousel HTML 생성 및 추가
  const carouselDiv = document.createElement('div');
  carouselDiv.className = 'combat-tracker-carousel';
  carouselDiv.innerHTML = cardsData.map(data => createCardHTML(data)).join('');

  container.appendChild(carouselDiv);
  
  // 컨테이너 너비를 카드 수에 맞게 동적으로 설정
  const cardWidth = 80 * 2.5 / 3; // 약 66.67px
  const cardGap = 5;
  const buttonSpace = 60; // 버튼 공간 (양쪽)
  const containerWidth = displayCount * cardWidth + (displayCount - 1) * cardGap + buttonSpace;
  
  container.style.width = `${containerWidth}px`;
}

/**
 * 카드 HTML 생성
 */
function createCardHTML(data) {
  const { combatant, offset, opacity } = data;
  
  // 프로세스 combatant 확인
  const isProcess = combatant.getFlag('double-cross-3rd', 'isProcessCombatant');
  
  let imgSrc, name;
  let isActionEnd = false;
  
  if (isProcess) {
    // 프로세스 combatant의 경우
    imgSrc = combatant.img || 'icons/svg/clockwork.svg';
    name = combatant.name;
  } else {
    // 일반 액터의 경우
    const actor = combatant.actor;
    imgSrc = actor?.img || 'icons/svg/mystery-man.svg';
    name = combatant.name || actor?.name || 'Unknown';
    
    // action_end.active 확인
    isActionEnd = actor?.system?.conditions?.action_end?.active === true;
  }

  // action_end가 활성화되어 있으면 흑백 필터 적용
  const imgStyle = isActionEnd ? 'filter: grayscale(100%);' : '';

  return `
    <div class="carousel-card" data-offset="${offset}" data-combatant-id="${combatant.id}" data-is-process="${isProcess}" style="opacity: ${opacity};">
      <div class="card-image-container">
        <img src="${imgSrc}" alt="${name}" style="${imgStyle}" />
      </div>
      <div class="card-name">${name}</div>
    </div>
  `;
}

/**
 * 카드 클릭 이벤트 추가
 */
function addCardClickEvents(container) {
  const cards = container.querySelectorAll('.carousel-card');
  
  cards.forEach(card => {
    // 더블클릭 이벤트
    card.addEventListener('dblclick', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // GM만 더블클릭 가능
      if (!game.user.isGM) return;
      
      const combatantId = card.dataset.combatantId;
      const isProcess = card.dataset.isProcess === 'true';
      
      // 프로세스 combatant는 제외
      if (isProcess) return;
      
      const combatant = game.combat.combatants.get(combatantId);
      if (!combatant || !combatant.token) return;
      
      // 현재 턴 액터인지 확인 (중앙 카드만 작동)
      const currentCombatant = game.combat.combatant;
      if (!currentCombatant || currentCombatant.id !== combatantId) return;
      
      // 액터의 소유자 찾기 (GM 제외, OWNER 권한만)
      const actor = combatant.actor;
      if (!actor) return;
      
      // 액터를 소유한 유저들 찾기 (GM이 아니고, OWNER 권한만)
      // ownership 객체에서 권한 레벨 3 (OWNER)인 유저만 필터링
      const ownerUsers = game.users.filter(user => {
        // GM 제외
        if (user.isGM) return false;
        // 해당 유저의 권한 확인
        const permission = actor.ownership?.[user.id];
        // OWNER 권한(레벨 3)인지 확인
        return permission === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      });
      
      // 소유자가 있으면 각 소유자에게 사운드 알림 전송
      if (ownerUsers.length > 0) {
        // 메시지 설정 가져오기
        const notificationMessage = game.settings.get(MODULE_ID, "turnNotificationMessage");
        
        ownerUsers.forEach(user => {
          game.socket.emit(`module.${MODULE_ID}`, {
            type: 'playTurnNotification',
            userId: user.id,
            message: notificationMessage || ""
          });
        });
      }
    });
    
    // 우클릭 이벤트 (컨텍스트 메뉴)
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const combatantId = card.dataset.combatantId;
      const isProcess = card.dataset.isProcess === 'true';
      
      // 프로세스 combatant는 제외
      if (isProcess) return;
      
      const combatant = game.combat.combatants.get(combatantId);
      if (!combatant) return;
      
      // 권한 체크 (GM이 아닌 경우)
      if (!game.user.isGM) {
        const actor = combatant.actor;
        // 액터에 대한 OWNER 권한이 없으면 무시
        if (!actor || !actor.testUserPermission(game.user, "OWNER")) {
          return;
        }
      }
      
      // 컨텍스트 메뉴 표시
      showCombatantContextMenu(e, combatant);
    });
  });
}

/**
 * 컴배턴트 컨텍스트 메뉴 표시
 */
function showCombatantContextMenu(event, combatant) {
  // 기존 메뉴가 있으면 제거
  const existingMenu = document.getElementById('dx3rd-combatant-context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
  
  // 메뉴 생성
  const menu = document.createElement('div');
  menu.id = 'dx3rd-combatant-context-menu';
  menu.className = 'dx3rd-combatant-context-menu';
  
  // 메뉴 항목들
  const actionEndRemoveText = game.i18n.localize('DX3rdHUD.CombatantMenu.ActionEndRemove');
  const rerollInitiativeText = game.i18n.localize('DX3rdHUD.CombatantMenu.RerollInitiative');
  const removeCombatantText = game.i18n.localize('DX3rdHUD.CombatantMenu.RemoveCombatant');
  
  menu.innerHTML = `
    <div class="context-menu-item" data-action="action-end-remove">
      <i class="fa-solid fa-arrow-rotate-left fa-fw"></i>
      <span>${actionEndRemoveText}</span>
    </div>
    <div class="context-menu-item" data-action="reroll-initiative">
      <i class="fa-solid fa-dice-d20 fa-fw"></i>
      <span>${rerollInitiativeText}</span>
    </div>
    <div class="context-menu-item" data-action="remove-combatant">
      <i class="fa-solid fa-trash fa-fw"></i>
      <span>${removeCombatantText}</span>
    </div>
  `;
  
  // 메뉴 위치 설정 (화면 경계 체크)
  document.body.appendChild(menu);
  
  // 메뉴 크기 측정
  const menuRect = menu.getBoundingClientRect();
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  let left = event.clientX;
  let top = event.clientY;
  
  // 오른쪽 경계 체크
  if (left + menuRect.width > windowWidth) {
    left = windowWidth - menuRect.width - 5;
  }
  
  // 아래쪽 경계 체크
  if (top + menuRect.height > windowHeight) {
    top = windowHeight - menuRect.height - 5;
  }
  
  // 왼쪽 경계 체크
  if (left < 5) {
    left = 5;
  }
  
  // 위쪽 경계 체크
  if (top < 5) {
    top = 5;
  }
  
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  
  // 메뉴 항목 클릭 이벤트
  menu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      
      switch (action) {
        case 'action-end-remove':
          await removeActionEnd(combatant);
          break;
        case 'reroll-initiative':
          await rerollInitiative(combatant);
          break;
        case 'remove-combatant':
          await removeCombatant(combatant);
          break;
      }
      
      menu.remove();
    });
  });
  
  // 메뉴 외부 클릭 시 닫기
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
    }
  };
  
  // 다음 프레임에서 이벤트 리스너 추가 (현재 이벤트가 전파되지 않도록)
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
    document.addEventListener('contextmenu', closeMenu);
  }, 0);
}

/**
 * 행동 종료 해제
 */
async function removeActionEnd(combatant) {
  if (!combatant.actor) return;
  
  const actor = combatant.actor;
  const currentValue = actor.system?.conditions?.action_end?.active;
  
  if (currentValue === true) {
    await actor.update({
      'system.conditions.action_end.active': false
    });
  }
}

/**
 * 우선권 재확인
 */
async function rerollInitiative(combatant) {
  if (!game.combat) return;
  
  const actor = combatant.actor;
  if (!actor) return;
  
  let initValue;
  
  // 행동 대기 상태 확인
  const isActionDelay = actor.system?.conditions?.action_delay?.active ?? false;
  if (isActionDelay) {
    const delayValue = Number(actor.system?.conditions?.action_delay?.value ?? 1);
    initValue = -delayValue;
  } else {
    // 액터의 현재 행동치 값 사용
    initValue = Number(actor.system?.attributes?.init?.value ?? 0);
  }
  
  // combatant의 initiative 업데이트
  await combatant.update({ initiative: initValue });
  
  // 전투 업데이트 (순서 재정렬)
  await game.combat.update({});
}

/**
 * 전투원 제거
 */
async function removeCombatant(combatant) {
  if (!game.combat) return;
  
  await combatant.delete();
}

/**
 * 핫바 높이에 따라 트랙커 위치 업데이트
 */
function updateTrackerPosition(container) {
  const hotbar = document.getElementById('hotbar');
  
  if (!hotbar || !container) return;
  
  // 핫바의 높이 측정
  const hotbarHeight = hotbar.offsetHeight;
  
  // 핫바 위에 10px 간격을 두고 배치
  const bottomPosition = hotbarHeight + 15;
  
  container.style.bottom = `${bottomPosition}px`;
  
  // 좌우 오프셋 적용
  const horizontalOffset = game.settings.get(MODULE_ID, "carouselHorizontalOffset");
  if (horizontalOffset !== 0) {
    container.style.left = `calc(50% + ${horizontalOffset}px)`;
  } else {
    container.style.left = '50%';
  }
}

/**
 * 핫바 크기 변경 감지 설정 (접기/펼치기 대응)
 */
let hotbarObserver = null;

function setupHotbarObserver(container) {
  const hotbar = document.getElementById('hotbar');
  
  if (!hotbar || !container) return;
  
  // 기존 observer가 있으면 제거
  if (hotbarObserver) {
    hotbarObserver.disconnect();
  }
  
  // ResizeObserver로 핫바 크기 변경 감지
  hotbarObserver = new ResizeObserver(() => {
    updateTrackerPosition(container);
  });
  
  hotbarObserver.observe(hotbar);
}

/**
 * Combat Tracker 컨테이너 제거
 */
function removeCombatTracker() {
  // Observer 정리
  if (hotbarObserver) {
    hotbarObserver.disconnect();
    hotbarObserver = null;
  }
  
  const existing = document.getElementById('dx3rd-combat-tracker');
  if (existing) {
    existing.remove();
  }
  
  // 모든 턴 강조 애니메이션 제거
  removeAllTurnHighlights();
}

/**
 * 턴 강조 설정 등록
 */
function registerTurnHighlightSettings() {
  game.settings.register(MODULE_ID, "turnHighlightImage", {
    name: game.i18n.localize("DX3rdHUD.TurnHighlight.Image"),
    hint: game.i18n.localize("DX3rdHUD.TurnHighlight.ImageHint"),
    scope: "world",
    config: true,
    type: String,
    default: "",
    filePicker: "imagevideo",
    onChange: () => {
      // 이미지 변경 시 즉시 반영
      if (game.combat && game.combat.started) {
        updateTurnHighlight();
      }
    }
  });
  
  game.settings.register(MODULE_ID, "turnHighlightScale", {
    name: game.i18n.localize("DX3rdHUD.TurnHighlight.Scale"),
    hint: game.i18n.localize("DX3rdHUD.TurnHighlight.ScaleHint"),
    scope: "world",
    config: true,
    type: Number,
    default: 1.5,
    range: {
      min: 0.5,
      max: 3.0,
      step: 0.1
    },
    onChange: () => {
      // 크기 변경 시 즉시 반영
      if (game.combat && game.combat.started) {
        updateTurnHighlight();
      }
    }
  });
  
  game.settings.register(MODULE_ID, "turnHighlightOpacity", {
    name: game.i18n.localize("DX3rdHUD.TurnHighlight.Opacity"),
    hint: game.i18n.localize("DX3rdHUD.TurnHighlight.OpacityHint"),
    scope: "world",
    config: true,
    type: Number,
    default: 0.7,
    range: {
      min: 0.1,
      max: 1.0,
      step: 0.1
    },
    onChange: () => {
      // 투명도 변경 시 즉시 반영
      if (game.combat && game.combat.started) {
        updateTurnHighlight();
      }
    }
  });
  
  game.settings.register(MODULE_ID, "turnHighlightRotation", {
    name: game.i18n.localize("DX3rdHUD.TurnHighlight.Rotation"),
    hint: game.i18n.localize("DX3rdHUD.TurnHighlight.RotationHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      // 회전 설정 변경 시 즉시 반영
      if (game.combat && game.combat.started) {
        updateTurnHighlight();
      }
    }
  });
  
  game.settings.register(MODULE_ID, "turnHighlightRotationSpeed", {
    name: game.i18n.localize("DX3rdHUD.TurnHighlight.RotationSpeed"),
    hint: game.i18n.localize("DX3rdHUD.TurnHighlight.RotationSpeedHint"),
    scope: "world",
    config: true,
    type: Number,
    default: 1.0,
    range: {
      min: 0.1,
      max: 3.0,
      step: 0.1
    },
    onChange: () => {
      // 회전 속도 변경 시 즉시 반영
      if (game.combat && game.combat.started) {
        updateTurnHighlight();
      }
    }
  });
  
  game.settings.register(MODULE_ID, "turnHighlightPosition", {
    name: game.i18n.localize("DX3rdHUD.TurnHighlight.Position"),
    hint: game.i18n.localize("DX3rdHUD.TurnHighlight.PositionHint"),
    scope: "world",
    config: true,
    type: String,
    default: "below",
    choices: {
      "below": game.i18n.localize("DX3rdHUD.TurnHighlight.PositionBelow"),
      "above": game.i18n.localize("DX3rdHUD.TurnHighlight.PositionAbove")
    },
    onChange: () => {
      // 위치 변경 시 즉시 반영
      if (game.combat && game.combat.started) {
        updateTurnHighlight();
      }
    }
  });
  
  game.settings.register(MODULE_ID, "turnHighlightOffsetX", {
    name: game.i18n.localize("DX3rdHUD.TurnHighlight.OffsetX"),
    hint: game.i18n.localize("DX3rdHUD.TurnHighlight.OffsetXHint"),
    scope: "world",
    config: true,
    type: Number,
    default: 0.0,
    range: {
      min: -2.0,
      max: 2.0,
      step: 0.1
    },
    onChange: () => {
      // X 오프셋 변경 시 즉시 반영
      if (game.combat && game.combat.started) {
        updateTurnHighlight();
      }
    }
  });
  
  game.settings.register(MODULE_ID, "turnHighlightOffsetY", {
    name: game.i18n.localize("DX3rdHUD.TurnHighlight.OffsetY"),
    hint: game.i18n.localize("DX3rdHUD.TurnHighlight.OffsetYHint"),
    scope: "world",
    config: true,
    type: Number,
    default: 0.0,
    range: {
      min: -2.0,
      max: 2.0,
      step: 0.1
    },
    onChange: () => {
      // Y 오프셋 변경 시 즉시 반영
      if (game.combat && game.combat.started) {
        updateTurnHighlight();
      }
    }
  });
  
  game.settings.register(MODULE_ID, "turnNotificationSound", {
    name: game.i18n.localize("DX3rdHUD.TurnNotificationSound"),
    hint: game.i18n.localize("DX3rdHUD.TurnNotificationSoundHint"),
    scope: "world",
    config: true,
    type: String,
    filePicker: "audio",
    default: "sounds/combat/mc-turn-itsyour.ogg"
  });
  
  game.settings.register(MODULE_ID, "turnNotificationSoundVolume", {
    name: game.i18n.localize("DX3rdHUD.TurnNotificationSoundVolume"),
    hint: game.i18n.localize("DX3rdHUD.TurnNotificationSoundVolumeHint"),
    scope: "world",
    config: true,
    type: Number,
    default: 1.0,
    range: {
      min: 0,
      max: 2.0,
      step: 0.1
    }
  });
  
  game.settings.register(MODULE_ID, "turnNotificationMessage", {
    name: game.i18n.localize("DX3rdHUD.TurnNotificationMessage"),
    hint: game.i18n.localize("DX3rdHUD.TurnNotificationMessageHint"),
    scope: "world",
    config: true,
    type: String,
    default: ""
  });
  
  game.settings.register(MODULE_ID, "turnNotificationMessageFontSize", {
    name: game.i18n.localize("DX3rdHUD.TurnNotificationMessageFontSize"),
    hint: game.i18n.localize("DX3rdHUD.TurnNotificationMessageFontSizeHint"),
    scope: "world",
    config: true,
    type: Number,
    default: 50,
    range: {
      min: 25,
      max: 75,
      step: 1
    }
  });
  
  game.settings.register(MODULE_ID, "enableInactivityMonitoring", {
    name: game.i18n.localize("DX3rdHUD.EnableInactivityMonitoring"),
    hint: game.i18n.localize("DX3rdHUD.EnableInactivityMonitoringHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });
  
  game.settings.register(MODULE_ID, "inactivityMonitoringTimeout", {
    name: game.i18n.localize("DX3rdHUD.InactivityMonitoringTimeout"),
    hint: game.i18n.localize("DX3rdHUD.InactivityMonitoringTimeoutHint"),
    scope: "world",
    config: true,
    type: Number,
    default: 15,
    range: {
      min: 5,
      max: 30,
      step: 1
    }
  });
  
  game.settings.register(MODULE_ID, "enableGMFocusMode", {
    name: game.i18n.localize("DX3rdHUD.EnableGMFocusMode"),
    hint: game.i18n.localize("DX3rdHUD.EnableGMFocusModeHint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });
  
  game.settings.register(MODULE_ID, "carouselMaxSlots", {
    name: game.i18n.localize("DX3rdHUD.Carousel.MaxSlots"),
    hint: game.i18n.localize("DX3rdHUD.Carousel.MaxSlotsHint"),
    scope: "client",
    config: true,
    type: String,
    default: "7",
    choices: {
      "3": "3",
      "5": "5",
      "7": "7",
      "9": "9"
    },
    requiresReload: true
  });
  
  game.settings.register(MODULE_ID, "carouselHorizontalOffset", {
    name: game.i18n.localize("DX3rdHUD.Carousel.HorizontalOffset"),
    hint: game.i18n.localize("DX3rdHUD.Carousel.HorizontalOffsetHint"),
    scope: "client",
    config: true,
    type: Number,
    default: 0,
    range: {
      min: -500,
      max: 500,
      step: 10
    },
    onChange: () => {
      // 설정 변경 시 전투 추적기 위치 업데이트
      const container = document.getElementById('dx3rd-combat-tracker');
      if (container) {
        updateTrackerPosition(container);
      }
    }
  });
}

/**
 * 현재 턴 강조 애니메이션 업데이트
 */
async function updateTurnHighlight() {
  // 전투가 없거나 시작되지 않았으면 제거
  if (!game.combat || !game.combat.started) {
    removeAllTurnHighlights();
    return;
  }
  
  // 설정에서 이미지 경로 가져오기
  const imagePath = game.settings.get(MODULE_ID, "turnHighlightImage");
  if (!imagePath) {
    // 이미지가 설정되지 않았으면 모든 강조 제거
    removeAllTurnHighlights();
    return;
  }
  
  // 현재 턴의 combatant 가져오기
  const currentCombatant = game.combat.combatant;
  if (!currentCombatant) {
    removeAllTurnHighlights();
    return;
  }
  
  // 프로세스 combatant 확인 (셋업/클린업은 제외)
  const isProcess = currentCombatant.getFlag('double-cross-3rd', 'isProcessCombatant');
  if (isProcess) {
    removeAllTurnHighlights();
    return;
  }
  
  // 토큰이 없으면 제거
  if (!currentCombatant.token) {
    removeAllTurnHighlights();
    return;
  }
  
  // 캔버스에서 토큰 객체 찾기
  const token = canvas.tokens.placeables.find(t => t.id === currentCombatant.token.id);
  if (!token) {
    removeAllTurnHighlights();
    return;
  }
  
  // 다른 토큰의 강조 제거 (현재 토큰 제외)
  canvas.tokens.placeables.forEach(t => {
    if (t.id !== token.id && t._dx3rdTurnHighlightLayer) {
      removeTurnHighlightLayer(t);
    }
  });
  
  // 현재 토큰에 강조 추가 (addTurnHighlight 내부에서 기존 강조를 즉시 제거함)
  await addTurnHighlight(token);
}

/**
 * 토큰에 턴 강조 애니메이션 추가
 */
async function addTurnHighlight(token) {
  try {
    // 이미 강조가 있으면 즉시 제거 (페이드 아웃 없이, 설정 변경 시 즉시 반영을 위해)
    if (token._dx3rdTurnHighlightLayer) {
      removeTurnHighlightLayer(token);
    }
    
    // 설정 값 가져오기
    const imagePath = game.settings.get(MODULE_ID, "turnHighlightImage");
    const scale = game.settings.get(MODULE_ID, "turnHighlightScale");
    const opacity = game.settings.get(MODULE_ID, "turnHighlightOpacity");
    const offsetX = game.settings.get(MODULE_ID, "turnHighlightOffsetX");
    const offsetY = game.settings.get(MODULE_ID, "turnHighlightOffsetY");
    
    if (!imagePath) return;
    
    // 레이어 초기화
    const layer = initializeTurnHighlightLayer(token);
    if (!layer) return;
    
    // 텍스처 로드
    const texture = await PIXI.Assets.load(imagePath);
    
    // 비디오 파일인 경우 비디오 요소 설정
    if (texture.baseTexture.resource?.source) {
      const source = texture.baseTexture.resource.source;
      if (source instanceof HTMLVideoElement) {
        source.loop = true;
        source.muted = true;
        source.autoplay = true;
        
        if (source.paused) {
          try {
            await source.play();
          } catch (e) {
          }
        }
      }
    }
    
    // 스프라이트 생성
    const sprite = new PIXI.Sprite(texture);
    
    // 토큰 크기에 맞춰 크기 조정
    const tokenSize = Math.max(token.document.width, token.document.height) * canvas.grid.size;
    const highlightSize = tokenSize * scale;
    
    sprite.width = highlightSize;
    sprite.height = highlightSize;
    sprite.anchor.set(0.5, 0.5);
    sprite.alpha = 0; // 초기 alpha는 0 (페이드 인 시작)
    
    // 토큰 중앙에 배치 (토큰 로컬 좌표)
    const centerX = (token.document.width * canvas.grid.size) / 2;
    const centerY = (token.document.height * canvas.grid.size) / 2;
    
    // 토큰 크기에 비례한 오프셋 적용
    sprite.x = centerX + (tokenSize * offsetX);
    sprite.y = centerY + (tokenSize * offsetY);
    
    // 초기 scale 값 저장
    const baseScaleX = sprite.scale.x;
    const baseScaleY = sprite.scale.y;
    
    // 레이어에 추가
    layer.addChild(sprite);
    
    // 페이드 인 애니메이션 (0.2초)
    const fadeInDuration = 0.2; // 초
    const fadeInSpeed = opacity / (fadeInDuration * 60); // 60fps 기준
    let fadeInProgress = 0;
    
    const fadeInTicker = (delta) => {
      if (sprite && !sprite.destroyed) {
        fadeInProgress += fadeInSpeed * delta;
        if (fadeInProgress >= opacity) {
          sprite.alpha = opacity;
          canvas.app.ticker.remove(fadeInTicker);
          delete sprite._fadeInTicker;
        } else {
          sprite.alpha = fadeInProgress;
        }
      } else {
        canvas.app.ticker.remove(fadeInTicker);
      }
    };
    canvas.app.ticker.add(fadeInTicker);
    sprite._fadeInTicker = fadeInTicker;
    
    // 회전 애니메이션 설정
    const rotationEnabled = game.settings.get(MODULE_ID, "turnHighlightRotation");
    
    if (rotationEnabled) {
      const baseRotationSpeed = 0.005; // 기본 회전 속도
      const rotationMultiplier = game.settings.get(MODULE_ID, "turnHighlightRotationSpeed");
      const rotationSpeed = baseRotationSpeed * rotationMultiplier;
      
      const ticker = (delta) => {
        if (sprite && !sprite.destroyed) {
          sprite.rotation += rotationSpeed * delta;
        } else {
          // 스프라이트가 파괴되면 ticker 제거
          canvas.app.ticker.remove(ticker);
        }
      };
      canvas.app.ticker.add(ticker);
      
      // ticker를 나중에 제거할 수 있도록 저장
      sprite._rotationTicker = ticker;
    }
    
  } catch (e) {
  }
}

/**
 * 토큰에서 턴 강조 애니메이션 제거 (페이드 아웃 포함)
 */
function removeTurnHighlight(token) {
  try {
    if (token._dx3rdTurnHighlightLayer) {
      const children = token._dx3rdTurnHighlightLayer.children.slice(); // 복사본 생성
      
      // 자식이 없으면 즉시 제거
      if (children.length === 0) {
        removeTurnHighlightLayer(token);
        return;
      }
      
      // 페이드 아웃 완료 카운터
      let fadeOutCompleteCount = 0;
      const totalChildren = children.length;
      
      const checkAllFadedOut = () => {
        fadeOutCompleteCount++;
        if (fadeOutCompleteCount >= totalChildren) {
          // 모든 자식의 페이드 아웃이 완료되면 레이어 제거
          removeTurnHighlightLayer(token);
        }
      };
      
      children.forEach(child => {
        // 페이드 인 ticker 제거
        if (child._fadeInTicker) {
          canvas.app.ticker.remove(child._fadeInTicker);
          delete child._fadeInTicker;
        }
        
        // 페이드 아웃 애니메이션 시작
        const currentAlpha = child.alpha;
        const fadeOutDuration = 0.2; // 초
        const fadeOutSpeed = currentAlpha / (fadeOutDuration * 60); // 60fps 기준
        let fadeOutProgress = currentAlpha;
        
        const fadeOutTicker = (delta) => {
          if (child && !child.destroyed) {
            fadeOutProgress -= fadeOutSpeed * delta;
            if (fadeOutProgress <= 0) {
              child.alpha = 0;
              canvas.app.ticker.remove(fadeOutTicker);
              delete child._fadeOutTicker;
              
              // 페이드 아웃 완료 확인
              checkAllFadedOut();
            } else {
              child.alpha = fadeOutProgress;
            }
          } else {
            canvas.app.ticker.remove(fadeOutTicker);
            delete child._fadeOutTicker;
            checkAllFadedOut();
          }
        };
        canvas.app.ticker.add(fadeOutTicker);
        child._fadeOutTicker = fadeOutTicker;
      });
    }
  } catch (e) {
    // 에러 발생 시 즉시 제거
    removeTurnHighlightLayer(token);
  }
}

/**
 * 턴 강조 레이어 실제 제거 (내부 함수)
 */
function removeTurnHighlightLayer(token) {
  try {
    if (token._dx3rdTurnHighlightLayer) {
      // 레이어의 모든 자식 제거
      token._dx3rdTurnHighlightLayer.removeChildren().forEach(child => {
        // 모든 ticker 제거
        if (child._fadeInTicker) {
          canvas.app.ticker.remove(child._fadeInTicker);
          delete child._fadeInTicker;
        }
        if (child._fadeOutTicker) {
          canvas.app.ticker.remove(child._fadeOutTicker);
          delete child._fadeOutTicker;
        }
        if (child._rotationTicker) {
          canvas.app.ticker.remove(child._rotationTicker);
          delete child._rotationTicker;
        }
        
        if (child.destroy) {
          child.destroy({ texture: false, baseTexture: false });
        }
      });
      
      // 레이어 제거
      token.removeChild(token._dx3rdTurnHighlightLayer);
      token._dx3rdTurnHighlightLayer.destroy();
      delete token._dx3rdTurnHighlightLayer;
    }
  } catch (e) {
  }
}

/**
 * 모든 토큰에서 턴 강조 애니메이션 제거
 */
function removeAllTurnHighlights() {
  if (!canvas.tokens) return;
  
  canvas.tokens.placeables.forEach(token => {
    removeTurnHighlight(token);
  });
}

/**
 * 토큰에 턴 강조 레이어 초기화
 */
function initializeTurnHighlightLayer(token) {
  try {
    // 기존 레이어가 있으면 제거 후 재생성 (위치 변경 대응)
    if (token._dx3rdTurnHighlightLayer) {
      // 기존 레이어의 자식들 제거
      token._dx3rdTurnHighlightLayer.removeChildren().forEach(child => {
        // 모든 ticker 제거
        if (child._fadeInTicker) {
          canvas.app.ticker.remove(child._fadeInTicker);
          delete child._fadeInTicker;
        }
        if (child._fadeOutTicker) {
          canvas.app.ticker.remove(child._fadeOutTicker);
          delete child._fadeOutTicker;
        }
        if (child._rotationTicker) {
          canvas.app.ticker.remove(child._rotationTicker);
          delete child._rotationTicker;
        }
        
        if (child.destroy) {
          child.destroy({ texture: false, baseTexture: false });
        }
      });
      
      // 기존 레이어 제거
      token.removeChild(token._dx3rdTurnHighlightLayer);
      token._dx3rdTurnHighlightLayer.destroy();
      delete token._dx3rdTurnHighlightLayer;
    }
    
    // 설정에서 위치 가져오기
    const position = game.settings.get(MODULE_ID, "turnHighlightPosition") || "below";
    
    // 새 레이어 생성
    const layer = new PIXI.Container();
    layer.name = 'dx3rd-turn-highlight';
    
    if (position === "below") {
      // 토큰 뒤에 배치하기 위해 zIndex를 낮게 설정
      layer.zIndex = -10;
      // 토큰에 레이어 추가 (맨 앞에 추가하여 뒤에 배치되도록)
      token.addChildAt(layer, 0);
    } else {
      // 토큰 위에 배치하기 위해 zIndex를 높게 설정
      layer.zIndex = 10;
      // 토큰에 레이어 추가 (맨 뒤에 추가하여 위에 배치되도록)
      token.addChild(layer);
    }
    
    token._dx3rdTurnHighlightLayer = layer;
    
    return layer;
    
  } catch (e) {
    return null;
  }
}

/**
 * 마우스 활동 추적 시작
 */
let mouseActivityTimer = null;
let lastActivity = Date.now(); // 마우스와 키보드 활동 모두 추적
let lastMouseLeftCanvas = null; // 마우스가 캔버스를 벗어난 시간
let isMouseInCanvas = false;
let hasNotifiedInactive = false;

function startMouseActivityTracking() {
  // GM은 추적하지 않음
  if (game.user.isGM) return;
  
  console.log(`DX3rd HUD | Starting inactivity monitoring for user: ${game.user.name}`);
  
  // 마우스 이동 이벤트 리스너
  document.addEventListener('mousemove', handleActivity);
  
  // 키보드 이벤트 리스너
  document.addEventListener('keydown', handleActivity);
  document.addEventListener('keypress', handleActivity);
  
  // 마우스가 캔버스 영역에 들어왔는지 확인
  const canvasElement = document.getElementById('board');
  if (canvasElement) {
    canvasElement.addEventListener('mouseenter', () => {
      isMouseInCanvas = true;
      lastMouseLeftCanvas = null; // 캔버스로 돌아오면 초기화
      handleActivity();
    });
    
    canvasElement.addEventListener('mouseleave', () => {
      isMouseInCanvas = false;
      lastMouseLeftCanvas = Date.now(); // 캔버스를 벗어난 시간 기록
    });
  }
  
  // 주기적으로 체크 (1초마다)
  setInterval(checkMouseActivity, 1000);
}

function handleActivity() {
  lastActivity = Date.now();
  
  // 비활성 알림을 보낸 상태에서 다시 활성화되면 GM에게 알림
  if (hasNotifiedInactive) {
    notifyPlayerActive();
    hasNotifiedInactive = false;
  }
}

function checkMouseActivity() {
  // 설정이 꺼져있으면 체크하지 않음
  const monitoringEnabled = game.settings.get(MODULE_ID, "enableInactivityMonitoring");
  if (!monitoringEnabled) {
    if (hasNotifiedInactive) {
      console.log(`DX3rd HUD | Inactivity monitoring disabled, clearing notification`);
    }
    hasNotifiedInactive = false;
    return;
  }
  
  // 전투가 진행 중이지 않으면 체크하지 않음
  if (!game.combat || !game.combat.started) {
    hasNotifiedInactive = false;
    return;
  }
  
  // 현재 턴의 combatant 가져오기
  const currentCombatant = game.combat.combatant;
  if (!currentCombatant || !currentCombatant.actor) {
    hasNotifiedInactive = false;
    return;
  }
  
  // 프로세스 combatant는 제외
  const isProcess = currentCombatant.getFlag('double-cross-3rd', 'isProcessCombatant');
  if (isProcess) {
    hasNotifiedInactive = false;
    return;
  }
  
  // 현재 유저가 해당 액터의 OWNER인지 확인
  const actor = currentCombatant.actor;
  const permission = actor.ownership?.[game.user.id];
  const isOwner = permission === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  
  if (!isOwner) {
    hasNotifiedInactive = false;
    return;
  }
  
  console.log(`DX3rd HUD | Checking inactivity - User: ${game.user.name}, Actor: ${actor.name}, Owner: ${isOwner}`);
  
  // 휴면 감지 시간 설정 가져오기 (초 단위)
  const inactivityTimeout = game.settings.get(MODULE_ID, "inactivityMonitoringTimeout") * 1000; // 밀리초로 변환
  
  // 비활성 조건 체크
  let isInactive = false;
  
  // 키보드 활동 체크 (마우스 위치와 무관)
  const timeSinceLastActivity = Date.now() - lastActivity;
  const hasRecentActivity = timeSinceLastActivity <= inactivityTimeout;
  
  console.log(`DX3rd HUD | Time since last activity: ${Math.round(timeSinceLastActivity / 1000)}s, isMouseInCanvas: ${isMouseInCanvas}, timeout: ${inactivityTimeout / 1000}s`);
  
  if (hasRecentActivity) {
    // 최근에 키보드나 마우스 활동이 있으면 활성 상태
    isInactive = false;
  } else if (isMouseInCanvas) {
    // 마우스가 캔버스 안에 있을 때: 설정된 시간 이상 활동이 없는지 확인
    isInactive = timeSinceLastActivity > inactivityTimeout;
  } else {
    // 마우스가 캔버스 밖에 있을 때: 설정된 시간 이상 밖에 있고 활동이 없는지 확인
    if (lastMouseLeftCanvas) {
      const timeSinceLeftCanvas = Date.now() - lastMouseLeftCanvas;
      isInactive = timeSinceLeftCanvas > inactivityTimeout && timeSinceLastActivity > inactivityTimeout;
    }
  }
  
  console.log(`DX3rd HUD | Is inactive: ${isInactive}, Has notified: ${hasNotifiedInactive}`);
  
  if (isInactive && !hasNotifiedInactive) {
    // GM에게 비활성 알림
    console.log(`DX3rd HUD | Notifying GM of inactivity for actor: ${actor.name}`);
    notifyPlayerInactive(actor.name);
    hasNotifiedInactive = true;
  }
}

function notifyPlayerInactive(actorName) {
  game.socket.emit(`module.${MODULE_ID}`, {
    type: 'playerInactive',
    userName: game.user.name,
    actorName: actorName
  });
}

function notifyPlayerActive() {
  game.socket.emit(`module.${MODULE_ID}`, {
    type: 'playerActive',
    userName: game.user.name
  });
}

/**
 * 비활성 추적 초기화 (턴 변경 시 호출)
 */
function resetInactivityTracking() {
  // GM에게 알림 제거
  if (game.user.isGM) {
    hidePlayerInactiveNotification();
    // GM 자신의 휴면 플래그도 초기화
    gmHasNotifiedSelf = false;
    gmLastActivity = Date.now();
    if (gmIsMouseInCanvas) {
      gmLastMouseLeftCanvas = null;
    }
  }
  
  // 플레이어는 비활성 플래그 초기화
  if (!game.user.isGM) {
    hasNotifiedInactive = false;
    lastActivity = Date.now();
    if (isMouseInCanvas) {
      lastMouseLeftCanvas = null;
    }
  }
}

/**
 * GM에게 플레이어 비활성 알림 표시
 */
function showPlayerInactiveNotification(userName, actorName) {
  // 기존 알림이 있으면 제거
  hidePlayerInactiveNotification();
  
  // 컴뱃 트랙커 찾기
  const combatTracker = document.getElementById('dx3rd-combat-tracker');
  if (!combatTracker) return;
  
  // 컴뱃 트랙커의 위치 가져오기
  const trackerRect = combatTracker.getBoundingClientRect();
  
  // 알림 생성
  const notification = document.createElement('div');
  notification.id = 'dx3rd-player-inactive-notification';
  notification.style.cssText = `
    position: fixed;
    top: ${trackerRect.top - 70}px;
    left: ${trackerRect.left + trackerRect.width / 2}px;
    transform: translateX(-50%);
    background: rgba(200, 50, 50, 0.95);
    color: white;
    padding: 15px 30px;
    border-radius: 10px;
    border: 3px solid rgba(255, 100, 100, 0.8);
    box-shadow: 0 0 20px rgba(255, 0, 0, 0.6);
    font-size: 16px;
    font-weight: bold;
    text-align: center;
    z-index: 99;
    white-space: nowrap;
    animation: dx3rd-pulse-notification 2s ease-in-out infinite;
    pointer-events: none;
  `;
  const message = game.i18n.format("DX3rdHUD.PlayerInactiveWarning", {
    userName: userName,
    actorName: actorName
  });
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // CSS 애니메이션 추가
  if (!document.getElementById('dx3rd-notification-style')) {
    const style = document.createElement('style');
    style.id = 'dx3rd-notification-style';
    style.textContent = `
      @keyframes dx3rd-pulse-notification {
        0%, 100% {
          opacity: 1;
          transform: translateX(-50%) scale(1);
        }
        50% {
          opacity: 0.8;
          transform: translateX(-50%) scale(1.05);
        }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * 플레이어 비활성 알림 제거
 */
function hidePlayerInactiveNotification() {
  const notification = document.getElementById('dx3rd-player-inactive-notification');
  if (notification) {
    notification.remove();
  }
}

/**
 * 턴 알림 메시지 표시 (플레이어 화면 중앙)
 */
function showTurnNotificationMessage(message) {
  // 기존 메시지가 있으면 제거
  hideTurnNotificationMessage();
  
  // HUD 폰트 설정 가져오기
  const selectedFont = game.settings.get("lichsoma-dx3rd-hud", "hudNameFont");
  let fontFamily = "Arial, sans-serif";
  if (selectedFont !== 'default') {
    fontFamily = `"${selectedFont}", Arial, sans-serif`;
  }
  
  // 폰트 크기 설정 가져오기
  const fontSize = game.settings.get(MODULE_ID, "turnNotificationMessageFontSize");
  
  // 메시지 생성
  const messageElement = document.createElement('div');
  messageElement.id = 'dx3rd-turn-notification-message';
  messageElement.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    padding: 40px 60px;
    font-size: ${fontSize}px;
    font-weight: bold;
    text-align: center;
    z-index: 10001;
    animation: dx3rd-message-appear 0.3s ease-out, dx3rd-message-pulse 2s ease-in-out infinite;
    pointer-events: none;
    white-space: pre-wrap;
    max-width: 80%;
    font-family: ${fontFamily};
    text-shadow: 
      -2px -2px 0 #ff0000,
      2px -2px 0 #ff0000,
      -2px 2px 0 #ff0000,
      2px 2px 0 #ff0000,
      0 0 10px rgba(255, 0, 0, 0.8),
      0 0 20px rgba(255, 0, 0, 0.6),
      0 0 30px rgba(255, 0, 0, 0.4),
      0 0 40px rgba(255, 0, 0, 0.2);
  `;
  messageElement.textContent = message;
  
  document.body.appendChild(messageElement);
  
  // CSS 애니메이션 추가
  if (!document.getElementById('dx3rd-turn-message-style')) {
    const style = document.createElement('style');
    style.id = 'dx3rd-turn-message-style';
    style.textContent = `
      @keyframes dx3rd-message-appear {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.8);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }
      @keyframes dx3rd-message-pulse {
        0%, 100% {
          transform: translate(-50%, -50%) scale(1);
        }
        50% {
          transform: translate(-50%, -50%) scale(1.1);
        }
      }
      @keyframes dx3rd-message-fadeout {
        0% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.9);
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  // 마우스 이동과 키보드 입력 감지 리스너 추가
  const removeListeners = () => {
    document.removeEventListener('mousemove', handleMessageDismiss);
    document.removeEventListener('keydown', handleMessageDismiss);
  };
  
  const handleMessageDismiss = () => {
    const msg = document.getElementById('dx3rd-turn-notification-message');
    if (msg) {
      // 페이드 아웃 애니메이션 적용
      msg.style.animation = 'dx3rd-message-fadeout 0.5s ease-out forwards';
      setTimeout(() => {
        hideTurnNotificationMessage();
      }, 500);
    }
    removeListeners();
  };
  
  // 이벤트 리스너 등록
  document.addEventListener('mousemove', handleMessageDismiss, { once: true });
  document.addEventListener('keydown', handleMessageDismiss, { once: true });
}

/**
 * 턴 알림 메시지 제거
 */
function hideTurnNotificationMessage() {
  const messageElement = document.getElementById('dx3rd-turn-notification-message');
  if (messageElement) {
    messageElement.remove();
  }
}

/**
 * GM용 휴면 감지 시작
 */
let gmLastActivity = Date.now();
let gmLastMouseLeftCanvas = null;
let gmIsMouseInCanvas = false;
let gmHasNotifiedSelf = false;

function startGMInactivityMonitoring() {
  console.log(`DX3rd HUD | Starting GM inactivity monitoring`);
  
  // 마우스 이동 이벤트 리스너
  document.addEventListener('mousemove', handleGMActivity);
  
  // 키보드 이벤트 리스너
  document.addEventListener('keydown', handleGMActivity);
  document.addEventListener('keypress', handleGMActivity);
  
  // 마우스가 캔버스 영역에 들어왔는지 확인
  const canvasElement = document.getElementById('board');
  if (canvasElement) {
    canvasElement.addEventListener('mouseenter', () => {
      gmIsMouseInCanvas = true;
      gmLastMouseLeftCanvas = null;
      handleGMActivity();
    });
    
    canvasElement.addEventListener('mouseleave', () => {
      gmIsMouseInCanvas = false;
      gmLastMouseLeftCanvas = Date.now();
    });
  }
  
  // 주기적으로 체크 (1초마다)
  setInterval(checkGMActivity, 1000);
}

function handleGMActivity() {
  gmLastActivity = Date.now();
  
  // 이미 알림을 받은 상태에서 다시 활성화되면 플래그 초기화
  if (gmHasNotifiedSelf) {
    gmHasNotifiedSelf = false;
  }
}

function checkGMActivity() {
  // GM 집중 모드 설정이 꺼져있으면 체크하지 않음
  const gmFocusModeEnabled = game.settings.get(MODULE_ID, "enableGMFocusMode");
  if (!gmFocusModeEnabled) {
    gmHasNotifiedSelf = false;
    return;
  }
  
  // 휴면 감지 설정이 꺼져있으면 체크하지 않음
  const monitoringEnabled = game.settings.get(MODULE_ID, "enableInactivityMonitoring");
  if (!monitoringEnabled) {
    gmHasNotifiedSelf = false;
    return;
  }
  
  // 전투가 진행 중이지 않으면 체크하지 않음
  if (!game.combat || !game.combat.started) {
    gmHasNotifiedSelf = false;
    return;
  }
  
  // 현재 턴의 combatant 가져오기
  const currentCombatant = game.combat.combatant;
  if (!currentCombatant || !currentCombatant.actor) {
    gmHasNotifiedSelf = false;
    return;
  }
  
  // 프로세스 combatant는 제외
  const isProcess = currentCombatant.getFlag('double-cross-3rd', 'isProcessCombatant');
  if (isProcess) {
    gmHasNotifiedSelf = false;
    return;
  }
  
  // 휴면 감지 시간 설정 가져오기
  const inactivityTimeout = game.settings.get(MODULE_ID, "inactivityMonitoringTimeout") * 1000;
  
  // 비활성 조건 체크
  let isInactive = false;
  
  const timeSinceLastActivity = Date.now() - gmLastActivity;
  const hasRecentActivity = timeSinceLastActivity <= inactivityTimeout;
  
  if (hasRecentActivity) {
    isInactive = false;
  } else if (gmIsMouseInCanvas) {
    // 마우스가 캔버스 안에 있을 때: 설정된 시간 이상 활동이 없는지 확인
    isInactive = timeSinceLastActivity > inactivityTimeout;
  } else {
    // 마우스가 캔버스 밖에 있을 때: 설정된 시간 이상 밖에 있고 활동이 없는지 확인
    if (gmLastMouseLeftCanvas) {
      const timeSinceLeftCanvas = Date.now() - gmLastMouseLeftCanvas;
      isInactive = timeSinceLeftCanvas > inactivityTimeout && timeSinceLastActivity > inactivityTimeout;
    }
  }
  
  if (isInactive && !gmHasNotifiedSelf) {
    // GM 자신에게 알림
    notifyGMInactivity();
    gmHasNotifiedSelf = true;
  }
}

function notifyGMInactivity() {
  console.log(`DX3rd HUD | GM is inactive, showing notification`);
  
  // 사운드 재생
  const soundPath = game.settings.get(MODULE_ID, "turnNotificationSound");
  const soundVolume = game.settings.get(MODULE_ID, "turnNotificationSoundVolume");
  if (soundPath) {
    AudioHelper.play({
      src: soundPath,
      volume: soundVolume,
      autoplay: true,
      loop: false
    }, false);
  }
  
  // 메시지 표시
  const message = game.settings.get(MODULE_ID, "turnNotificationMessage");
  if (message && message.trim() !== "") {
    showTurnNotificationMessage(message);
  }
}

