// DX3rd HUD Main Script

const MODULE_ID = "lichsoma-dx3rd-hud";

// 장면별 HUD 토글 상태 저장
const sceneHudStates = {};

// 현재 장면의 HUD 상태 가져오기
function getSceneHudState() {
  const sceneId = canvas.scene?.id;
  if (!sceneId) return { playerHudVisible: false, enemyHudVisible: false, allyVisible: false };
  
  if (!sceneHudStates[sceneId]) {
    sceneHudStates[sceneId] = { playerHudVisible: false, enemyHudVisible: false, allyVisible: false };
  }
  
  return sceneHudStates[sceneId];
}

// 현재 장면의 HUD 상태 저장
function setSceneHudState(playerVisible, enemyVisible, allyVisible) {
  const sceneId = canvas.scene?.id;
  if (!sceneId) return;
  
  if (!sceneHudStates[sceneId]) {
    sceneHudStates[sceneId] = {};
  }
  
  if (playerVisible !== undefined) sceneHudStates[sceneId].playerHudVisible = playerVisible;
  if (enemyVisible !== undefined) sceneHudStates[sceneId].enemyHudVisible = enemyVisible;
  if (allyVisible !== undefined) sceneHudStates[sceneId].allyVisible = allyVisible;
}

// 모듈 초기화
Hooks.once('init', () => {
  registerHUDSettings();
});

Hooks.once('ready', () => {
  createPlayerHUD();
  createEnemyHUD();
  
  // Enemy HUD 위치 초기 설정
  updateEnemyHUDPosition();
  
  // Sidebar collapse/expand 감지
  observeSidebarChanges();
  
  // 초기 폰트 적용
  setTimeout(() => {
    applyHUDNameFont();
  }, 500);
  
  // 이미 진행 중인 전투가 있고, 전투 시작 시 자동 활성화 설정이 켜져있다면 HUD 활성화
  // canvasReady에서도 처리하지만, ready에서도 한 번 더 확인하여 확실히 처리
  setTimeout(() => {
    if (game.combat && game.combat.started && game.combat.round > 0) {
      const state = getSceneHudState();
      const autoEnablePlayerHUD = game.settings.get(MODULE_ID, "autoEnablePlayerHUDOnCombatStart");
      const autoEnableEnemyHUD = game.settings.get(MODULE_ID, "autoEnableEnemyHUDOnCombatStart");
      
      if (autoEnablePlayerHUD && !state.playerHudVisible) {
        const container = document.getElementById('dx3rd-player-hud');
        if (container && container.classList.contains('hidden')) {
          togglePlayerHUD();
        }
      }
      
      if (autoEnableEnemyHUD && !state.enemyHudVisible) {
        const container = document.getElementById('dx3rd-enemy-hud');
        if (container && container.classList.contains('hidden')) {
          toggleEnemyHUD();
        }
      }
    }
  }, 600);
});

// 장면 준비 완료 시 HUD 업데이트
Hooks.on('canvasReady', () => {
  const state = getSceneHudState();
  const playerContainer = document.getElementById('dx3rd-player-hud');
  const enemyContainer = document.getElementById('dx3rd-enemy-hud');
  
  // 저장된 토글 상태 복원
  if (playerContainer) {
    if (state.playerHudVisible) {
      playerContainer.classList.remove('hidden');
      updatePlayerHUD();
    } else {
      playerContainer.classList.add('hidden');
    }
  }
  
  if (enemyContainer) {
    if (state.enemyHudVisible) {
      enemyContainer.classList.remove('hidden');
      updateEnemyHUD();
    } else {
      enemyContainer.classList.add('hidden');
    }
  }
  
  // 이미 진행 중인 전투가 있고, 전투 시작 시 자동 활성화 설정이 켜져있다면 HUD 활성화
  if (game.combat && game.combat.started && game.combat.round > 0) {
    const autoEnablePlayerHUD = game.settings.get(MODULE_ID, "autoEnablePlayerHUDOnCombatStart");
    const autoEnableEnemyHUD = game.settings.get(MODULE_ID, "autoEnableEnemyHUDOnCombatStart");
    
    if (autoEnablePlayerHUD && !state.playerHudVisible) {
      const container = document.getElementById('dx3rd-player-hud');
      if (container && container.classList.contains('hidden')) {
        togglePlayerHUD();
      }
    }
    
    if (autoEnableEnemyHUD && !state.enemyHudVisible) {
      const container = document.getElementById('dx3rd-enemy-hud');
      if (container && container.classList.contains('hidden')) {
        toggleEnemyHUD();
      }
    }
  }
  
  // Scene Control Buttons의 active 상태 업데이트 (약간 지연)
  setTimeout(() => {
    updateHUDButtonStates();
  }, 100);
  
  // 폰트 재적용
  setTimeout(() => {
    applyHUDNameFont();
  }, 100);
});

// HUD 버튼의 active 상태 업데이트
function updateHUDButtonStates() {
  const state = getSceneHudState();
  
  // Player HUD 버튼
  const playerBtn = document.querySelector('.scene-control[data-tool="player-hud"]');
  if (playerBtn) {
    if (state.playerHudVisible) {
      playerBtn.classList.add('active');
      playerBtn.setAttribute('aria-pressed', 'true');
    } else {
      playerBtn.classList.remove('active');
      playerBtn.setAttribute('aria-pressed', 'false');
    }
  }
  
  // Enemy HUD 버튼
  const enemyBtn = document.querySelector('.scene-control[data-tool="enemy-hud"]');
  if (enemyBtn) {
    if (state.enemyHudVisible) {
      enemyBtn.classList.add('active');
      enemyBtn.setAttribute('aria-pressed', 'true');
    } else {
      enemyBtn.classList.remove('active');
      enemyBtn.setAttribute('aria-pressed', 'false');
    }
  }
}

// 토큰 생성 시 HUD 증분 업데이트
Hooks.on('createToken', (tokenDoc) => {
  const state = getSceneHudState();
  if (!state.playerHudVisible) return;
  
  const token = canvas.tokens.placeables.find(t => t.id === tokenDoc.id);
  if (!token || !token.actor) return;
  
  const actorType = token.actor.system.actorType;
  if (actorType === 'PlayerCharacter' || actorType === 'Ally') {
    addPlayerToHUD(token);
  }
  // Enemy HUD는 컴배턴트 기반이므로 토큰 생성만으로는 업데이트하지 않음
});

// 토큰 삭제 시 HUD에서 제거
Hooks.on('deleteToken', (tokenDoc) => {
  const state = getSceneHudState();
  const tokenId = tokenDoc.id;
  
  // Player HUD에서 해당 토큰 제거
  if (state.playerHudVisible) {
    const list = document.getElementById('dx3rd-hud-players-list');
    if (list) {
      const row = list.querySelector(`.pc-ui-row[data-token-id="${tokenId}"]`);
      if (row) {
        // 삭제할 토큰의 타입 확인
        const wasAlly = row.dataset.actorType === 'Ally';
        
        row.remove();
        
        // 조력자를 삭제한 경우, 남은 조력자가 있는지 체크
        if (wasAlly) {
          const remainingAllyRows = list.querySelectorAll('.pc-ui-row[data-actor-type="Ally"]');
          if (remainingAllyRows.length === 0) {
            // 남은 조력자가 없으면 버튼 숨김
            const toggleBtn = document.querySelector('.dx3rd-hud-toggle-ally-btn');
            if (toggleBtn) {
              toggleBtn.style.display = 'none';
            }
          }
        }
      }
    }
  }
  
  // Enemy HUD에서도 해당 토큰 제거 (토큰 삭제 시 컴배턴트도 자동 삭제되지만, 
  // 토큰 삭제 이벤트에서 직접 제거하여 즉시 반영)
  if (state.enemyHudVisible) {
    const enemyList = document.getElementById('dx3rd-hud-enemies-list');
    if (enemyList) {
      const enemyRow = enemyList.querySelector(`.enemy-ui-row[data-token-id="${tokenId}"]`);
      if (enemyRow) {
        enemyRow.remove();
      }
    }
  }
});

// 토큰 업데이트 시 HUD 업데이트
Hooks.on('updateToken', (tokenDocument, updateData, options, userId) => {
  // HUD에 영향을 주는 중요한 필드들 체크
  // HP, 침식률 등은 updateActor 훅에서 처리하므로 여기서는 토큰 관련 필드만 체크
  const importantFields = ['hidden', 'alpha', 'brightness', 'saturation', 'tint', 'vision', 
                          'actorId', 'actorLink', 'actorData', 'disposition', 
                          'displayName', 'displayBars', 'bar1', 'bar2'];
  const hasImportantChange = importantFields.some(field => updateData[field] !== undefined);
  
  // 중요한 필드가 변경되지 않았으면 스킵
  // 위치 변경(x, y, rotation 등)이나 flags 변경(이동 기록 삭제 등)은 HUD와 무관하므로 무시
  if (!hasImportantChange) {
    return;
  }
  
  const state = getSceneHudState();
  if (state.playerHudVisible) updatePlayerHUD();
  if (state.enemyHudVisible) updateEnemyHUD();
});

// 컴배턴트 추가 시 Enemy HUD 증분 업데이트
Hooks.on('createCombatant', (combatant, options, userId) => {
  const state = getSceneHudState();
  if (!state.enemyHudVisible) return;
  
  const actor = combatant.actor;
  if (!actor) return;
  
  const actorType = actor.system.actorType;
  if (actorType === 'Enemy' || actorType === 'Troop') {
    addEnemyToHUD(combatant);
  }
});

// 컴배턴트 삭제 시 Enemy HUD에서 제거
Hooks.on('deleteCombatant', (combatant, options, userId) => {
  const state = getSceneHudState();
  if (!state.enemyHudVisible) return;
  
  const actor = combatant.actor;
  if (!actor) return;
  
  const actorType = actor.system.actorType;
  if (actorType === 'Enemy' || actorType === 'Troop') {
    const list = document.getElementById('dx3rd-hud-enemies-list');
    if (list) {
      // 토큰 ID 가져오기 (토큰이 이미 삭제된 경우를 대비)
      const tokenId = combatant.token?.id || combatant.tokenId || combatant.data?.tokenId;
      if (tokenId) {
        const row = list.querySelector(`.enemy-ui-row[data-token-id="${tokenId}"]`);
        if (row) {
          row.remove();
        }
      }
    }
  }
});

// 전투 상태 변경 시 Enemy HUD 업데이트 및 전투 시작 감지
Hooks.on('updateCombat', (combat, changed, options, userId) => {
  const state = getSceneHudState();
  if (state.enemyHudVisible) {
    updateEnemyHUD();
  }
  
  // 턴 변경 감지
  if (changed.turn !== undefined || changed.combatantId !== undefined) {
    updateCurrentTurnHighlight();
  }
  
  // 전투 시작 감지 (라운드가 0에서 1로 변경되거나 started 플래그가 true로 변경될 때)
  const roundChanged = changed.round !== undefined && changed.round > 0;
  const startedChanged = changed.started !== undefined && changed.started === true;
  
  if (roundChanged || startedChanged) {
    // 전투 시작 시 자동 활성화 설정 확인
    const autoEnablePlayerHUD = game.settings.get(MODULE_ID, "autoEnablePlayerHUDOnCombatStart");
    const autoEnableEnemyHUD = game.settings.get(MODULE_ID, "autoEnableEnemyHUDOnCombatStart");
    
    if (autoEnablePlayerHUD && !state.playerHudVisible) {
      // 플레이어 HUD가 비활성화되어 있으면 활성화
      const container = document.getElementById('dx3rd-player-hud');
      if (container && container.classList.contains('hidden')) {
        togglePlayerHUD();
      }
    }
    
    if (autoEnableEnemyHUD && !state.enemyHudVisible) {
      // 에너미 HUD가 비활성화되어 있으면 활성화
      const container = document.getElementById('dx3rd-enemy-hud');
      if (container && container.classList.contains('hidden')) {
        toggleEnemyHUD();
      }
    }
  }
});

// 전투 생성 시 Enemy HUD 업데이트
Hooks.on('createCombat', (combat, options, userId) => {
  const state = getSceneHudState();
  if (state.enemyHudVisible) {
    updateEnemyHUD();
  }
  
  // 전투 생성 시 즉시 시작되는 경우를 대비한 자동 활성화 (updateCombat과 중복되지 않도록)
  // updateCombat에서 라운드 변경을 감지하므로, 여기서는 이미 시작된 전투만 처리
  if (combat.started && combat.round > 0) {
    const autoEnablePlayerHUD = game.settings.get(MODULE_ID, "autoEnablePlayerHUDOnCombatStart");
    const autoEnableEnemyHUD = game.settings.get(MODULE_ID, "autoEnableEnemyHUDOnCombatStart");
    
    if (autoEnablePlayerHUD && !state.playerHudVisible) {
      const container = document.getElementById('dx3rd-player-hud');
      if (container && container.classList.contains('hidden')) {
        togglePlayerHUD();
      }
    }
    
    if (autoEnableEnemyHUD && !state.enemyHudVisible) {
      const container = document.getElementById('dx3rd-enemy-hud');
      if (container && container.classList.contains('hidden')) {
        toggleEnemyHUD();
      }
    }
  }
});

// 전투 삭제 시 Enemy HUD 업데이트 및 자동 비활성화
Hooks.on('deleteCombat', (combat, options, userId) => {
  const state = getSceneHudState();
  if (state.enemyHudVisible) {
    updateEnemyHUD();
  }
  
  // 전투 종료 시 자동 비활성화 설정 확인
  const autoDisablePlayerHUD = game.settings.get(MODULE_ID, "autoDisablePlayerHUDOnCombatEnd");
  const autoDisableEnemyHUD = game.settings.get(MODULE_ID, "autoDisableEnemyHUDOnCombatEnd");
  
  if (autoDisablePlayerHUD && state.playerHudVisible) {
    // 플레이어 HUD가 활성화되어 있으면 비활성화
    const container = document.getElementById('dx3rd-player-hud');
    if (container && !container.classList.contains('hidden')) {
      togglePlayerHUD();
    }
  }
  
  if (autoDisableEnemyHUD && state.enemyHudVisible) {
    // 에너미 HUD가 활성화되어 있으면 비활성화
    const container = document.getElementById('dx3rd-enemy-hud');
    if (container && !container.classList.contains('hidden')) {
      toggleEnemyHUD();
    }
  }
});

// 액터 업데이트 시 해당 액터만 실시간 업데이트
Hooks.on('updateActor', (actor, changes) => {
  const state = getSceneHudState();
  
  // 변경된 필드 확인 (HP, 침식률 등)
  const hasRelevantChanges = changes.system?.attributes?.hp || 
                              changes.system?.attributes?.encroachment ||
                              changes.img ||
                              changes.name;
  
  if (!hasRelevantChanges) return;
  
  // 현재 씬에서 해당 액터의 토큰 찾기
  if (!canvas.tokens) return;
  
  const tokens = canvas.tokens.placeables.filter(t => t.actor?.id === actor.id);
  if (!tokens.length) return;
  
  const actorType = actor.system.actorType;
  
  // Player/Ally인 경우
  if ((actorType === 'PlayerCharacter' || actorType === 'Ally') && state.playerHudVisible) {
    tokens.forEach(token => {
      const row = document.querySelector(`#dx3rd-hud-players-list .pc-ui-row[data-token-id="${token.id}"]`);
      if (row) {
        updatePCHUDRow(row, token);
      }
    });
  }
  
  // Enemy/Troop인 경우 (컴배턴트에 등록된 경우만)
  if ((actorType === 'Enemy' || actorType === 'Troop') && state.enemyHudVisible) {
    // 현재 전투가 있고, 해당 액터가 컴배턴트에 등록되어 있는지 확인
    if (game.combat) {
      const isInCombat = game.combat.combatants.some(c => c.actor?.id === actor.id);
      if (isInCombat) {
        tokens.forEach(token => {
          const row = document.querySelector(`#dx3rd-hud-enemies-list .enemy-ui-row[data-token-id="${token.id}"]`);
          if (row) {
            updateEnemyHUDRow(row, token);
          }
        });
      }
    }
  }
});

// Active Effect 생성 시 상태이상 실시간 업데이트
Hooks.on('createActiveEffect', (effect, options, userId) => {
  const actor = effect.parent;
  if (!actor || !(actor instanceof Actor)) return;
  
  updateActorEffects(actor);
});

// Active Effect 삭제 시 상태이상 실시간 업데이트
Hooks.on('deleteActiveEffect', (effect, options, userId) => {
  const actor = effect.parent;
  if (!actor || !(actor instanceof Actor)) return;
  
  updateActorEffects(actor);
});

// Active Effect 업데이트 시 상태이상 실시간 업데이트
Hooks.on('updateActiveEffect', (effect, changes, options, userId) => {
  const actor = effect.parent;
  if (!actor || !(actor instanceof Actor)) return;
  
  // disabled 상태 변경 시에만 업데이트
  if (changes.disabled !== undefined) {
    updateActorEffects(actor);
  }
});

// 특정 액터의 상태이상만 업데이트
function updateActorEffects(actor) {
  const state = getSceneHudState();
  if (!canvas.tokens) return;
  
  const tokens = canvas.tokens.placeables.filter(t => t.actor?.id === actor.id);
  if (!tokens.length) return;
  
  const actorType = actor.system.actorType;
  
  // Player/Ally인 경우
  if ((actorType === 'PlayerCharacter' || actorType === 'Ally') && state.playerHudVisible) {
    tokens.forEach(token => {
      const row = document.querySelector(`#dx3rd-hud-players-list .pc-ui-row[data-token-id="${token.id}"]`);
      if (row) {
        const cond = row.querySelector(".pc-condition-container");
        if (cond) {
          cond.innerHTML = '';
          actor.effects.filter(e => !e.disabled).forEach(e => {
            const box = document.createElement('div');
            box.className = 'pc-condition-icon-box';
            box.title = e.name;
            
            const icon = document.createElement('img');
            icon.src = e.img;
            icon.alt = e.name;
            
            box.appendChild(icon);
            cond.appendChild(box);
          });
        }
      }
    });
  }
  
  // Enemy/Troop인 경우 (컴배턴트에 등록된 경우만)
  if ((actorType === 'Enemy' || actorType === 'Troop') && state.enemyHudVisible) {
    // 현재 전투가 있고, 해당 액터가 컴배턴트에 등록되어 있는지 확인
    if (game.combat) {
      const isInCombat = game.combat.combatants.some(c => c.actor?.id === actor.id);
      if (isInCombat) {
        tokens.forEach(token => {
          const row = document.querySelector(`#dx3rd-hud-enemies-list .enemy-ui-row[data-token-id="${token.id}"]`);
          if (row) {
            const cond = row.querySelector(".enemy-condition-container");
            if (cond) {
              cond.innerHTML = '';
              actor.effects.filter(e => !e.disabled).forEach(e => {
                const box = document.createElement('div');
                box.className = 'enemy-condition-icon-box';
                box.title = e.name;
                
                const icon = document.createElement('img');
                icon.src = e.icon;
                icon.alt = e.name;
                
                box.appendChild(icon);
                cond.appendChild(box);
              });
            }
          }
        });
      }
    }
  }
}

Hooks.on('getSceneControlButtons', (controls) => {
  // v13에서는 controls가 객체 형태로 전달됨
  const tokenControls = controls.tokens || controls.token;
  
  if (tokenControls) {
    if (tokenControls.tools && typeof tokenControls.tools === 'object' && !Array.isArray(tokenControls.tools)) {
      const state = getSceneHudState();
      
      tokenControls.tools['player-hud'] = {
        name: 'player-hud',
        title: 'DX3rdHUD.PlayerHUD',
        icon: 'fa-solid fa-heart-pulse',
        toggle: true,
        active: state.playerHudVisible,
        onChange: () => {
          togglePlayerHUD();
        }
      };
      
      tokenControls.tools['enemy-hud'] = {
        name: 'enemy-hud',
        title: 'DX3rdHUD.EnemyHUD',
        icon: 'fa-solid fa-skull',
        toggle: true,
        active: state.enemyHudVisible,
        onChange: () => {
          toggleEnemyHUD();
        }
      };
    }
  }
});

// Scene Controls 렌더링 후 버튼 상태 업데이트
Hooks.on('renderSceneControls', () => {
  setTimeout(() => {
    updateHUDButtonStates();
  }, 50);
});

// Player HUD 생성
function createPlayerHUD() {
  const container = document.createElement('div');
  container.id = 'dx3rd-player-hud';
  container.className = 'dx3rd-player-hud hidden';
  
  container.innerHTML = `
    <div class="dx3rd-hud-toggle-ally-btn" title="${game.i18n.localize('DX3rdHUD.ToggleAlly')}">
      <i class="fa-solid fa-eye-slash"></i>
    </div>
    <div class="dx3rd-hud-players-list" id="dx3rd-hud-players-list">
      <!-- Player items will be added here -->
    </div>
  `;
  
  // 토글 버튼 이벤트 리스너 추가
  const toggleBtn = container.querySelector('.dx3rd-hud-toggle-ally-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleAllyVisibility);
  }
  
  const uiLeftColumn = document.getElementById('ui-left-column-1');
  if (uiLeftColumn) {
    uiLeftColumn.appendChild(container);
  }
}

// Enemy HUD 생성
function createEnemyHUD() {
  const container = document.createElement('div');
  container.id = 'dx3rd-enemy-hud';
  container.className = 'dx3rd-enemy-hud hidden';
  
  container.innerHTML = `
    <div class="dx3rd-hud-enemies-list" id="dx3rd-hud-enemies-list">
      <!-- Enemy items will be added here -->
    </div>
  `;
  
  const uiRightColumn = document.getElementById('ui-right-column-1');
  if (uiRightColumn) {
    // 첫 번째 자식 요소로 추가 (위쪽에 배치)
    uiRightColumn.insertBefore(container, uiRightColumn.firstChild);
  }
}

// Enemy HUD 위치 업데이트 (sidebar 넓이 기반)
function updateEnemyHUDPosition() {
  const enemyHUD = document.getElementById('dx3rd-enemy-hud');
  if (!enemyHUD) return;
  
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) {
    // sidebar가 없으면 기본값 사용
    enemyHUD.style.right = '20px';
    return;
  }
  
  // sidebar가 collapsed 상태인지 확인
  const isCollapsed = sidebar.classList.contains('collapsed');
  const sidebarWidth = sidebar.offsetWidth;
  
  if (isCollapsed) {
    // collapsed 상태: 아이콘만 보이므로 작은 여백
    enemyHUD.style.right = '20px';
  } else {
    // expanded 상태: sidebar 넓이 + 여백
    const rightPos = sidebarWidth + 30;
    enemyHUD.style.right = `${rightPos}px`;
  }
}

// Sidebar 변화 감지
function observeSidebarChanges() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) {
    return;
  }
  
  // MutationObserver를 사용하여 sidebar의 class 변화 감지
  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        // sidebar의 collapsed 상태가 변경되었을 때 즉시 위치 업데이트
        updateEnemyHUDPosition();
      }
    });
  });
  
  // sidebar의 class 속성 변화 감지 시작
  mutationObserver.observe(sidebar, {
    attributes: true,
    attributeFilter: ['class']
  });
  
  // ResizeObserver를 사용하여 sidebar의 실제 크기 변화 감지
  const resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      // sidebar의 크기가 변경되었을 때
      updateEnemyHUDPosition();
    }
  });
  
  // sidebar의 크기 변화 감지 시작
  resizeObserver.observe(sidebar);
  
  // 윈도우 리사이즈 시에도 업데이트
  window.addEventListener('resize', () => {
    updateEnemyHUDPosition();
  });
}

// Player HUD 토글
function togglePlayerHUD() {
  const container = document.getElementById('dx3rd-player-hud');
  if (!container) return;
  
  const state = getSceneHudState();
  const newState = !state.playerHudVisible;
  
  // 장면별 상태 저장
  setSceneHudState(newState, undefined, undefined);
  
  if (newState) {
    container.classList.remove('hidden');
    updatePlayerHUD();
  } else {
    container.classList.add('hidden');
  }
  
  // Scene Controls의 active 상태 업데이트
  if (ui.controls && ui.controls.controls) {
    // v13에서는 controls가 객체 형태
    const tokenControls = ui.controls.controls.tokens || ui.controls.controls.token;
    if (tokenControls && tokenControls.tools) {
      // tools도 객체 형태일 수 있음
      if (typeof tokenControls.tools === 'object' && !Array.isArray(tokenControls.tools)) {
        const playerTool = tokenControls.tools['player-hud'];
        if (playerTool) {
          playerTool.active = newState;
        }
      } else if (Array.isArray(tokenControls.tools)) {
        const playerTool = tokenControls.tools.find(t => t.name === 'player-hud');
        if (playerTool) {
          playerTool.active = newState;
        }
      }
    }
  }
  
  // 버튼 상태 업데이트
  updateHUDButtonStates();
}

// 조력자 표시 토글
function toggleAllyVisibility() {
  const state = getSceneHudState();
  const newState = !state.allyVisible;
  
  // 장면별 상태 저장
  setSceneHudState(undefined, undefined, newState);
  
  // 모든 Ally row 찾기
  const list = document.getElementById('dx3rd-hud-players-list');
  if (!list) return;
  
  const allyRows = Array.from(list.querySelectorAll('.pc-ui-row')).filter(row => {
    const tokenId = row.dataset.tokenId;
    const token = canvas.tokens.placeables.find(t => t.id === tokenId);
    return token && token.actor && token.actor.system.actorType === 'Ally';
  });
  
  // 토글 버튼 상태 업데이트
  const toggleBtn = document.querySelector('.dx3rd-hud-toggle-ally-btn');
  if (toggleBtn) {
    const icon = toggleBtn.querySelector('i');
    if (newState) {
      // 보임 상태: eye 아이콘
      toggleBtn.classList.remove('inactive');
      if (icon) {
        icon.className = 'fa-solid fa-eye';
      }
    } else {
      // 숨김 상태: eye-slash 아이콘
      toggleBtn.classList.add('inactive');
      if (icon) {
        icon.className = 'fa-solid fa-eye-slash';
      }
    }
  }
  
  // Ally row 표시/숨김
  allyRows.forEach(row => {
    if (newState) {
      row.classList.remove('ally-hidden');
    } else {
      row.classList.add('ally-hidden');
    }
  });
}

// Enemy HUD 토글
function toggleEnemyHUD() {
  const container = document.getElementById('dx3rd-enemy-hud');
  if (!container) return;
  
  const state = getSceneHudState();
  const newState = !state.enemyHudVisible;
  
  // 장면별 상태 저장
  setSceneHudState(undefined, newState, undefined);
  
  if (newState) {
    container.classList.remove('hidden');
    updateEnemyHUD();
  } else {
    container.classList.add('hidden');
  }
  
  // Scene Controls의 active 상태 업데이트
  if (ui.controls && ui.controls.controls) {
    // v13에서는 controls가 객체 형태
    const tokenControls = ui.controls.controls.tokens || ui.controls.controls.token;
    if (tokenControls && tokenControls.tools) {
      // tools도 객체 형태일 수 있음
      if (typeof tokenControls.tools === 'object' && !Array.isArray(tokenControls.tools)) {
        const enemyTool = tokenControls.tools['enemy-hud'];
        if (enemyTool) {
          enemyTool.active = newState;
        }
      } else if (Array.isArray(tokenControls.tools)) {
        const enemyTool = tokenControls.tools.find(t => t.name === 'enemy-hud');
        if (enemyTool) {
          enemyTool.active = newState;
        }
      }
    }
  }
  
  // 버튼 상태 업데이트
  updateHUDButtonStates();
}

// Player HUD 업데이트
function updatePlayerHUD() {
  const list = document.getElementById('dx3rd-hud-players-list');
  if (!list) return;
  
  list.innerHTML = '';
  
  // 현재 씬의 모든 토큰 가져오기
  if (!canvas.tokens) return;
  
  const tokens = canvas.tokens.placeables.filter(token => {
    if (!token.actor) return false;
    const actorType = token.actor.system.actorType;
    return actorType === 'PlayerCharacter' || actorType === 'Ally';
  });
  
  if (!tokens.length) {
    return;
  }
  
  // 정렬: 소유자 → 행동치 → 이름
  tokens.sort(compareTokenOrderPC);
  
  // 조력자 토큰이 있는지 확인
  const hasAlly = tokens.some(token => token.actor.system.actorType === 'Ally');
  
  // HUD Row 생성
  const state = getSceneHudState();
  tokens.forEach(token => {
    const row = buildPCHUDRow(token);
    
    // Ally row에 표시 상태 적용
    if (token.actor.system.actorType === 'Ally') {
      if (!state.allyVisible) {
        row.classList.add('ally-hidden');
      }
    }
    
    list.appendChild(row);
  });
  
  // 토글 버튼 상태 업데이트
  const toggleBtn = document.querySelector('.dx3rd-hud-toggle-ally-btn');
  if (toggleBtn) {
    // 조력자가 있으면 버튼 표시, 없으면 숨김
    if (hasAlly) {
      toggleBtn.style.display = 'flex';
      
      const icon = toggleBtn.querySelector('i');
      if (state.allyVisible) {
        // 보임 상태: eye 아이콘
        toggleBtn.classList.remove('inactive');
        if (icon) {
          icon.className = 'fa-solid fa-eye';
        }
      } else {
        // 숨김 상태: eye-slash 아이콘
        toggleBtn.classList.add('inactive');
        if (icon) {
          icon.className = 'fa-solid fa-eye-slash';
        }
      }
    } else {
      // 조력자가 없으면 버튼 숨김
      toggleBtn.style.display = 'none';
    }
  }
  
  // 폰트 재적용
  setTimeout(() => {
    applyHUDNameFont();
  }, 50);
}

// Enemy HUD 업데이트 (컴배턴트 기반)
function updateEnemyHUD() {
  const list = document.getElementById('dx3rd-hud-enemies-list');
  if (!list) return;
  
  list.innerHTML = '';
  
  // 현재 활성 전투가 없으면 빈 화면
  if (!game.combat) {
    return;
  }
  
  if (!canvas.tokens) return;
  
  // 컴배턴트에 등록된 토큰만 가져오기
  const combatants = game.combat.combatants.filter(combatant => {
    if (!combatant.actor) return false;
    const actorType = combatant.actor.system.actorType;
    if (actorType !== 'Enemy' && actorType !== 'Troop') return false;
    
    // 숨겨진 토큰: GM은 보이고, 플레이어는 제외
    if (combatant.token?.hidden && !game.user.isGM) {
      return false;
    }
    
    return true;
  });
  
  if (!combatants.length) {
    return;
  }
  
  // 컴배턴트에서 토큰 객체 가져오기
  const tokens = combatants.map(combatant => {
    // 캔버스에서 실제 토큰 객체 찾기
    return canvas.tokens.placeables.find(t => t.id === combatant.token.id);
  }).filter(t => t !== undefined);
  
  // 정렬: 행동치 → 이름
  tokens.sort(compareTokenOrderEnemy);
  
  // HUD Row 생성
  tokens.forEach(token => {
    const row = buildEnemyHUDRow(token);
    list.appendChild(row);
  });
  
  // 폰트 재적용
  setTimeout(() => {
    applyHUDNameFont();
  }, 50);
}

// Player HUD에 새로운 토큰 추가 (증분 업데이트)
function addPlayerToHUD(token) {
  const list = document.getElementById('dx3rd-hud-players-list');
  if (!list) return;
  
  // 이미 존재하는지 확인
  const existingRow = list.querySelector(`.pc-ui-row[data-token-id="${token.id}"]`);
  if (existingRow) {
    return;
  }
  
  // 새 Row 생성
  const newRow = buildPCHUDRow(token);
  
  // Ally row에 표시 상태 적용
  const state = getSceneHudState();
  if (token.actor.system.actorType === 'Ally') {
    if (!state.allyVisible) {
      newRow.classList.add('ally-hidden');
    }
  }
  
  // 적절한 위치에 삽입 (소유자 → 행동치 순서 유지)
  const existingRows = Array.from(list.querySelectorAll('.pc-ui-row'));
  let inserted = false;
  
  for (let i = 0; i < existingRows.length; i++) {
    const existingTokenId = existingRows[i].dataset.tokenId;
    const existingToken = canvas.tokens.placeables.find(t => t.id === existingTokenId);
    
    if (existingToken && compareTokenOrderPC(token, existingToken) < 0) {
      list.insertBefore(newRow, existingRows[i]);
      inserted = true;
      break;
    }
  }
  
  if (!inserted) {
    list.appendChild(newRow);
  }
  
  // 조력자 토글 버튼 업데이트 (조력자가 추가된 경우 버튼 표시)
  if (token.actor.system.actorType === 'Ally') {
    const toggleBtn = document.querySelector('.dx3rd-hud-toggle-ally-btn');
    if (toggleBtn && toggleBtn.style.display === 'none') {
      const state = getSceneHudState();
      toggleBtn.style.display = 'flex';
      
      const icon = toggleBtn.querySelector('i');
      if (state.allyVisible) {
        toggleBtn.classList.remove('inactive');
        if (icon) icon.className = 'fa-solid fa-eye';
      } else {
        toggleBtn.classList.add('inactive');
        if (icon) icon.className = 'fa-solid fa-eye-slash';
      }
    }
  }
  
  // 폰트 재적용
  setTimeout(() => {
    applyHUDNameFont();
  }, 50);
}

// Enemy HUD에 새로운 컴배턴트 추가 (증분 업데이트)
function addEnemyToHUD(combatant) {
  const list = document.getElementById('dx3rd-hud-enemies-list');
  if (!list) return;
  
  if (!canvas.tokens) return;
  
  // 숨겨진 토큰: GM만 보임
  if (combatant.token?.hidden && !game.user.isGM) {
    return;
  }
  
  // 토큰 찾기
  const token = canvas.tokens.placeables.find(t => t.id === combatant.token.id);
  if (!token) return;
  
  // 이미 존재하는지 확인
  const existingRow = list.querySelector(`.enemy-ui-row[data-token-id="${token.id}"]`);
  if (existingRow) {
    return;
  }
  
  // 새 Row 생성
  const newRow = buildEnemyHUDRow(token);
  
  // 적절한 위치에 삽입 (행동치 순서 유지)
  const existingRows = Array.from(list.querySelectorAll('.enemy-ui-row'));
  let inserted = false;
  
  for (let i = 0; i < existingRows.length; i++) {
    const existingTokenId = existingRows[i].dataset.tokenId;
    const existingToken = canvas.tokens.placeables.find(t => t.id === existingTokenId);
    
    if (existingToken && compareTokenOrderEnemy(token, existingToken) < 0) {
      list.insertBefore(newRow, existingRows[i]);
      inserted = true;
      break;
    }
  }
  
  if (!inserted) {
    list.appendChild(newRow);
  }
  
  // 폰트 재적용
  setTimeout(() => {
    applyHUDNameFont();
  }, 50);
}

// PC HUD Row 생성
function buildPCHUDRow(token) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("pc-ui-row");
  wrapper.dataset.tokenId = token.id;
  wrapper.dataset.actorType = token.actor.system.actorType;
  
  // 현재 턴 확인
  if (game.combat && game.combat.started) {
    const currentCombatant = game.combat.combatant;
    if (currentCombatant && currentCombatant.token?.id === token.id) {
      wrapper.classList.add("current-turn");
    }
  }
  
  wrapper.innerHTML = `
    <div class="pc-ui-icon-wrapper">
      <div class="pc-ui-icon-frame">
        <img class="pc-ui-icon" src=""/>
      </div>
      <div class="pc-ui-actor-name"></div>
    </div>
    <div class="pc-bars">
      <div class="pc-bar-hp">
        <div class="pc-hp-fill-container">
          <div class="pc-hp-fill"></div>
        </div>
        <div class="pc-bar-hp-text"></div>
      </div>
      <div class="pc-bar-enc">
        <div class="pc-enc-fill-container">
          <div class="pc-enc-fill-1"></div>
          <div class="pc-enc-fill-2"></div>
          <div class="pc-enc-fill-3"></div>
        </div>
        <div class="pc-bar-enc-text"></div>
      </div>
      <div class="pc-condition-container"></div>
    </div>
  `;
  
  updatePCHUDRow(wrapper, token);
  
  // Small 버전 적용 조건:
  // 1. GM이면 무조건 small
  // 2. 일반 플레이어면 소유자가 아닐 때만 small
  let applySmall = false;
  if (game.user.isGM) {
    applySmall = true;
  } else if (!token.actor.isOwner) {
    applySmall = true;
  }
  
  if (applySmall) {
    wrapper.classList.add("small");
    const hpBar = wrapper.querySelector(".pc-bar-hp");
    const encBar = wrapper.querySelector(".pc-bar-enc");
    const actorName = wrapper.querySelector(".pc-ui-actor-name");
    if (hpBar) hpBar.classList.add("small");
    if (encBar) encBar.classList.add("small");
    if (actorName) actorName.classList.add("small");
  }
  
  // 아이콘 더블 클릭 시 시트 열기
  const iconWrapper = wrapper.querySelector('.pc-ui-icon-wrapper');
  if (iconWrapper) {
    iconWrapper.style.cursor = 'pointer';
    iconWrapper.addEventListener('dblclick', () => token.actor.sheet.render(true));
  }
  
  // 권한이 있는 액터의 이름에 호버 및 클릭 기능 추가
  const actorNameElement = wrapper.querySelector('.pc-ui-actor-name');
  if (actorNameElement && token.actor.isOwner) {
    actorNameElement.classList.add('has-permission');
    
    // 클릭 시 토큰으로 팬아웃 및 선택
    actorNameElement.addEventListener('click', async () => {
      if (!token || !canvas.ready) return;
      
      // 토큰으로 팬아웃
      await canvas.animatePan({
        x: token.x,
        y: token.y,
        duration: 250
      });
      
      // 토큰 선택
      token.control({ releaseOthers: true });
    });
  }
  
  // 권한이 있는 액터의 HP바와 침식률바 클릭 기능 추가
  if (token.actor.isOwner) {
    const hpBar = wrapper.querySelector('.pc-bar-hp');
    const hpText = wrapper.querySelector('.pc-bar-hp-text');
    const encBar = wrapper.querySelector('.pc-bar-enc');
    const encText = wrapper.querySelector('.pc-bar-enc-text');
    
    if (hpBar) hpBar.classList.add('has-permission');
    if (hpText) hpText.classList.add('has-permission');
    if (encBar) encBar.classList.add('has-permission');
    if (encText) encText.classList.add('has-permission');
    
    // HP 편집 가능한 값 클릭 시 수정
    const hpEditableValue = wrapper.querySelector('.pc-bar-hp-text .editable-value[data-type="hp"]');
    if (hpEditableValue) {
      hpEditableValue.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditingHP(hpEditableValue, token.actor);
      });
    }
    
    // 침식률 편집 가능한 값 클릭 시 수정
    const encEditableValue = wrapper.querySelector('.pc-bar-enc-text .editable-value[data-type="enc"]');
    if (encEditableValue) {
      encEditableValue.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditingEncroachment(encEditableValue, token.actor);
      });
    }
  }
  
  return wrapper;
}

// PC HUD Row 업데이트
function updatePCHUDRow(wrapper, token) {
  const actor = token.actor;
  const hp = actor.system.attributes.hp.value;
  const maxHp = actor.system.attributes.hp.max;
  const enc = actor.system.attributes.encroachment.value ?? 0;
  
  // HP 퍼센트 계산
  const hpPct = Math.clamp(hp / maxHp, 0, 1) * 100;
  
  // 이전 침식률 값 가져오기 (순차 애니메이션용)
  // dataset에 저장된 값이 없으면 현재 DOM의 실제 값에서 역산
  let prevEnc = parseInt(wrapper.dataset.encroachment || '');
  if (isNaN(prevEnc)) {
    // DOM에서 현재 침식률 값 역산
    const fill1 = wrapper.querySelector(".pc-bar-enc .pc-enc-fill-1");
    const fill2 = wrapper.querySelector(".pc-bar-enc .pc-enc-fill-2");
    const fill3 = wrapper.querySelector(".pc-bar-enc .pc-enc-fill-3");
    
    if (fill1 && fill2 && fill3) {
      const seg1Width = parseFloat(fill1.style.width) || 0;
      const seg2Width = parseFloat(fill2.style.width) || 0;
      const seg3Width = parseFloat(fill3.style.width) || 0;
      prevEnc = Math.min(seg1Width, 100) + Math.min(seg2Width, 100) + Math.min(seg3Width, 100);
    } else {
      prevEnc = enc; // 요소가 없으면 현재 값과 같다고 가정
    }
  }
  
  // 값이 변경되지 않았으면 애니메이션 없이 즉시 적용하고 종료
  if (prevEnc === enc) {
    wrapper.dataset.encroachment = enc;
    const fill1 = wrapper.querySelector(".pc-bar-enc .pc-enc-fill-1");
    const fill2 = wrapper.querySelector(".pc-bar-enc .pc-enc-fill-2");
    const fill3 = wrapper.querySelector(".pc-bar-enc .pc-enc-fill-3");
    
    const seg1 = Math.min(enc, 100);
    const seg2 = enc > 100 ? Math.min(enc - 100, 100) : 0;
    const seg3 = enc > 200 ? Math.min(enc - 200, 100) : 0;
    
    if (fill1) fill1.style.width = `${seg1}%`;
    if (fill2) fill2.style.width = `${seg2}%`;
    if (fill3) fill3.style.width = `${seg3}%`;
  } else {
    wrapper.dataset.encroachment = enc;
  }
  
  // 침식률 구간 계산 (0-100, 101-200, 201-300)
  const seg1 = Math.min(enc, 100);
  const seg2 = enc > 100 ? Math.min(enc - 100, 100) : 0;
  const seg3 = enc > 200 ? Math.min(enc - 200, 100) : 0;
  
  // HP 색상 (초록 → 빨강 그라데이션)
  const start = { r: 0x00, g: 0x82, b: 0x26 };
  const end = { r: 0xd3, g: 0x2d, b: 0x14 };
  const t = hpPct / 100;
  const r = Math.round(start.r * t + end.r * (1 - t));
  const g = Math.round(start.g * t + end.g * (1 - t));
  const b = Math.round(start.b * t + end.b * (1 - t));
  const hpColor = `rgb(${r},${g},${b})`;
  
  // HP 바 적용
  wrapper.querySelector(".pc-bar-hp .pc-hp-fill").style.width = `${hpPct}%`;
  wrapper.querySelector(".pc-bar-hp .pc-hp-fill").style.background = hpColor;
  
  // HP 텍스트 업데이트
  const hpTextElement = wrapper.querySelector(".pc-bar-hp-text");
  if (hpTextElement) {
    hpTextElement.innerHTML = `<span class="editable-value" data-type="hp">${hp}</span>/${maxHp}`;
  }
  
  // 피격 표시용 블러드 마크 (피가 많이 줄어들수록 진해짐)
  const wrapperIcon = wrapper.querySelector('.pc-ui-icon-wrapper');
  
  // 기존 오버레이 요소들을 찾거나 새로 생성
  let overlayA = wrapperIcon.querySelector('.blood-overlay-a');
  let overlayB = wrapperIcon.querySelector('.blood-overlay-b');
  let overlayC = wrapperIcon.querySelector('.blood-overlay-c');
  
  if (!overlayA) {
    overlayA = document.createElement('img');
    overlayA.src = 'modules/lichsoma-dx3rd-hud/assets/blood_mark_a.png';
    overlayA.classList.add('blood-overlay', 'blood-overlay-a');
    overlayA.style.opacity = '0';
    wrapperIcon.appendChild(overlayA);
  }
  if (!overlayB) {
    overlayB = document.createElement('img');
    overlayB.src = 'modules/lichsoma-dx3rd-hud/assets/blood_mark_b.png';
    overlayB.classList.add('blood-overlay', 'blood-overlay-b');
    overlayB.style.opacity = '0';
    wrapperIcon.appendChild(overlayB);
  }
  if (!overlayC) {
    overlayC = document.createElement('img');
    overlayC.src = 'modules/lichsoma-dx3rd-hud/assets/blood_mark_c.png';
    overlayC.classList.add('blood-overlay', 'blood-overlay-c');
    overlayC.style.opacity = '0';
    wrapperIcon.appendChild(overlayC);
  }
  
  // opacity 값 업데이트
  requestAnimationFrame(() => {
    overlayA.style.opacity = hpPct < 75 ? String(1 - hpPct / 100) : '0';
    overlayB.style.opacity = hpPct < 50 ? String(1 - hpPct / 100) : '0';
    overlayC.style.opacity = hpPct <= 25 ? String(1 - hpPct / 100) : '0';
  });
  
  // 침식률 바 적용 (순차적으로)
  const fill1 = wrapper.querySelector(".pc-bar-enc .pc-enc-fill-1");
  const fill2 = wrapper.querySelector(".pc-bar-enc .pc-enc-fill-2");
  const fill3 = wrapper.querySelector(".pc-bar-enc .pc-enc-fill-3");
  
  // 값이 변경되지 않았으면 애니메이션 없이 건너뛰기 (이미 위에서 즉시 적용됨)
  if (prevEnc !== enc) {
    // 증가하는 경우: seg1 → seg2 → seg3 순차적으로
    if (enc > prevEnc) {
      // seg1 먼저 설정
      if (fill1) fill1.style.width = `${seg1}%`;
      
      // seg1이 100%일 때만 seg2 설정 (300ms 후)
      if (seg1 >= 100) {
        setTimeout(() => {
          if (fill2) fill2.style.width = `${seg2}%`;
        }, 300);
      } else {
        if (fill2) fill2.style.width = '0%';
        if (fill3) fill3.style.width = '0%';
      }
      
      // seg2가 100%일 때만 seg3 설정 (600ms 후)
      if (seg1 >= 100 && seg2 >= 100) {
        setTimeout(() => {
          if (fill3) fill3.style.width = `${seg3}%`;
        }, 600);
      } else if (seg2 < 100) {
        if (fill3) fill3.style.width = '0%';
      }
    }
    // 감소하는 경우: seg3 → seg2 → seg1 역순으로
    else if (enc < prevEnc) {
      // seg3부터 설정
      if (fill3) fill3.style.width = `${seg3}%`;
      
      // 300ms 후 seg2 설정
      setTimeout(() => {
        if (fill2) fill2.style.width = `${seg2}%`;
      }, 300);
      
      // 600ms 후 seg1 설정
      setTimeout(() => {
        if (fill1) fill1.style.width = `${seg1}%`;
      }, 600);
    }
  }
  
  // 침식률 텍스트 업데이트
  const encTextElement = wrapper.querySelector(".pc-bar-enc-text");
  if (encTextElement) {
    encTextElement.innerHTML = `<span class="editable-value" data-type="enc">${enc}</span>%`;
  }
  
  // 아이콘 업데이트 (HUD 설정이 있으면 사용)
  const img = wrapper.querySelector(".pc-ui-icon");
  const hudImage = actor.getFlag('lichsoma-dx3rd-hud', 'hudImage');
  const hudOffsetX = actor.getFlag('lichsoma-dx3rd-hud', 'hudOffsetX');
  const hudOffsetY = actor.getFlag('lichsoma-dx3rd-hud', 'hudOffsetY');
  const hudScale = actor.getFlag('lichsoma-dx3rd-hud', 'hudScale');
  
  // HUD 이미지 설정
  if (hudImage && hudImage !== actor.img) {
    img.src = hudImage;
    img.classList.remove('actor-image');
    img.classList.add('hud-image');
  } else {
    img.src = actor.img;
    img.classList.remove('hud-image');
    img.classList.add('actor-image');
  }
  
  // HUD 오프셋 및 스케일 설정
  let transformParts = ['skewX(20deg)', 'translate(-50%, -50%)'];
  
  // 오프셋 설정 (기본값 사용)
  const finalOffsetX = hudOffsetX !== null && hudOffsetX !== undefined ? hudOffsetX : 50;
  const finalOffsetY = hudOffsetY !== null && hudOffsetY !== undefined ? hudOffsetY : 50;
  const finalScale = hudScale !== null && hudScale !== undefined ? hudScale : 100;
  
  img.style.left = `${finalOffsetX}%`;
  img.style.top = `${finalOffsetY}%`;
  
  if (finalScale !== 100) {
    transformParts.push(`scale(${finalScale / 100})`);
  }
  
  img.style.transform = transformParts.join(' ');
  
  // 이름 업데이트
  const actorNameElement = wrapper.querySelector(".pc-ui-actor-name");
  actorNameElement.textContent = actor.name;
  
  // 권한이 있는 경우 has-permission 클래스 추가 (스타일 유지)
  if (actor.isOwner) {
    actorNameElement.classList.add('has-permission');
    
    // HP바와 침식률바에도 has-permission 클래스 추가
    const hpBar = wrapper.querySelector('.pc-bar-hp');
    const hpText = wrapper.querySelector('.pc-bar-hp-text');
    const encBar = wrapper.querySelector('.pc-bar-enc');
    const encText = wrapper.querySelector('.pc-bar-enc-text');
    
    if (hpBar) hpBar.classList.add('has-permission');
    if (hpText) hpText.classList.add('has-permission');
    if (encBar) encBar.classList.add('has-permission');
    if (encText) encText.classList.add('has-permission');
    
    // HP와 침식률 편집 가능한 값에 이벤트 리스너 다시 추가 (innerHTML로 교체되어 이벤트가 사라졌을 수 있음)
    const hpEditableValue = wrapper.querySelector('.pc-bar-hp-text .editable-value[data-type="hp"]');
    if (hpEditableValue && !hpEditableValue.dataset.listenerAttached) {
      hpEditableValue.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditingHP(hpEditableValue, actor);
      });
      hpEditableValue.dataset.listenerAttached = 'true';
    }
    
    const encEditableValue = wrapper.querySelector('.pc-bar-enc-text .editable-value[data-type="enc"]');
    if (encEditableValue && !encEditableValue.dataset.listenerAttached) {
      encEditableValue.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditingEncroachment(encEditableValue, actor);
      });
      encEditableValue.dataset.listenerAttached = 'true';
    }
  } else {
    actorNameElement.classList.remove('has-permission');
    
    // HP바와 침식률바에서도 has-permission 클래스 제거
    const hpBar = wrapper.querySelector('.pc-bar-hp');
    const hpText = wrapper.querySelector('.pc-bar-hp-text');
    const encBar = wrapper.querySelector('.pc-bar-enc');
    const encText = wrapper.querySelector('.pc-bar-enc-text');
    
    if (hpBar) hpBar.classList.remove('has-permission');
    if (hpText) hpText.classList.remove('has-permission');
    if (encBar) encBar.classList.remove('has-permission');
    if (encText) encText.classList.remove('has-permission');
  }
  
  // 상태이상 아이콘 표시
  const cond = wrapper.querySelector(".pc-condition-container");
  cond.innerHTML = '';
  actor.effects.filter(e => !e.disabled).forEach(e => {
    const box = document.createElement('div');
    box.className = 'pc-condition-icon-box';
    box.title = e.name;
    
    const icon = document.createElement('img');
    icon.src = e.img;
    icon.alt = e.name;
    
    box.appendChild(icon);
    cond.appendChild(box);
  });
}

// 토큰 정렬 함수
function compareTokenOrderPC(a, b) {
  const tokenA = a.token || a;
  const tokenB = b.token || b;
  
  // 1. 소유자 우선
  const aOwned = tokenA.actor?.isOwner;
  const bOwned = tokenB.actor?.isOwner;
  if (aOwned !== bOwned) return aOwned ? -1 : 1;
  
  // 2. 액터 타입 (PlayerCharacter > Ally)
  const aType = tokenA.actor?.system.actorType;
  const bType = tokenB.actor?.system.actorType;
  if (aType === 'PlayerCharacter' && bType === 'Ally') return -1;
  if (aType === 'Ally' && bType === 'PlayerCharacter') return 1;
  
  // 3. 행동치 내림차순
  const ai = tokenA.actor?.system.attributes.init.value ?? 0;
  const bi = tokenB.actor?.system.attributes.init.value ?? 0;
  if (ai !== bi) return bi - ai;
  
  // 4. 이름 오름차순
  return tokenA.actor?.name.localeCompare(tokenB.actor?.name, 'ko');
}

// 에너미 토큰 정렬 함수
function compareTokenOrderEnemy(a, b) {
  const tokenA = a.token || a;
  const tokenB = b.token || b;
  
  // 1. 액터 타입 (Enemy > Troop)
  const aType = tokenA.actor?.system.actorType;
  const bType = tokenB.actor?.system.actorType;
  if (aType === 'Enemy' && bType === 'Troop') return -1;
  if (aType === 'Troop' && bType === 'Enemy') return 1;
  
  // 2. 행동치 내림차순
  const ai = tokenA.actor?.system.attributes.init.value ?? 0;
  const bi = tokenB.actor?.system.attributes.init.value ?? 0;
  if (ai !== bi) return bi - ai;
  
  // 3. 이름 오름차순
  return tokenA.actor?.name.localeCompare(tokenB.actor?.name, 'ko');
}

// Enemy HUD Row 생성
function buildEnemyHUDRow(token) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("enemy-ui-row");
  wrapper.dataset.tokenId = token.id;
  
  // 현재 턴 확인
  if (game.combat && game.combat.started) {
    const currentCombatant = game.combat.combatant;
    if (currentCombatant && currentCombatant.token?.id === token.id) {
      wrapper.classList.add("current-turn");
    }
  }
  
  wrapper.innerHTML = `
    <div class="enemy-bars">
      <div class="enemy-bar-hp">
        <div class="enemy-hp-fill-container">
          <div class="enemy-hp-fill"></div>
        </div>
        <div class="enemy-bar-hp-text"></div>
      </div>
      <div class="enemy-bar-enc">
        <div class="enemy-enc-fill-container">
          <div class="enemy-enc-fill-1"></div>
          <div class="enemy-enc-fill-2"></div>
          <div class="enemy-enc-fill-3"></div>
        </div>
        <div class="enemy-bar-enc-text"></div>
      </div>
      <div class="enemy-condition-container"></div>
    </div>
    <div class="enemy-ui-icon-wrapper">
      <div class="enemy-ui-icon-frame">
        <img class="enemy-ui-icon" src=""/>
      </div>
      <div class="enemy-ui-actor-name"></div>
    </div>
  `;
  
  updateEnemyHUDRow(wrapper, token);
  
  // Small 버전 적용 조건: Troop 타입이면 small
  const actorType = token.actor.system.actorType;
  const applySmall = (actorType === 'Troop');
  
  if (applySmall) {
    wrapper.classList.add("small");
    const hpBar = wrapper.querySelector(".enemy-bar-hp");
    const encBar = wrapper.querySelector(".enemy-bar-enc");
    const actorName = wrapper.querySelector(".enemy-ui-actor-name");
    if (hpBar) hpBar.classList.add("small");
    if (encBar) encBar.classList.add("small");
    if (actorName) actorName.classList.add("small");
  }
  
  // 숨겨진 토큰: GM에게만 투명도 적용
  if (token.document.hidden && game.user.isGM) {
    wrapper.classList.add("hidden-token");
  }
  
  // 아이콘 더블 클릭 시 시트 열기
  const iconWrapper = wrapper.querySelector('.enemy-ui-icon-wrapper');
  if (iconWrapper) {
    iconWrapper.style.cursor = 'pointer';
    iconWrapper.addEventListener('dblclick', () => token.actor.sheet.render(true));
  }
  
  // GM만 이름에 호버 및 클릭 기능 추가
  const actorNameElement = wrapper.querySelector('.enemy-ui-actor-name');
  if (actorNameElement && game.user.isGM) {
    actorNameElement.classList.add('has-permission');
    
    // 클릭 시 토큰으로 팬아웃 및 선택
    actorNameElement.addEventListener('click', async () => {
      if (!token || !canvas.ready) return;
      
      // 토큰으로 팬아웃
      await canvas.animatePan({
        x: token.x,
        y: token.y,
        duration: 250
      });
      
      // 토큰 선택
      token.control({ releaseOthers: true });
    });
  }
  
  // GM만 HP바와 침식률바 클릭 기능 추가
  if (game.user.isGM) {
    const hpBar = wrapper.querySelector('.enemy-bar-hp');
    const hpText = wrapper.querySelector('.enemy-bar-hp-text');
    const encBar = wrapper.querySelector('.enemy-bar-enc');
    const encText = wrapper.querySelector('.enemy-bar-enc-text');
    
    if (hpBar) hpBar.classList.add('has-permission');
    if (hpText) hpText.classList.add('has-permission');
    if (encBar) encBar.classList.add('has-permission');
    if (encText) encText.classList.add('has-permission');
    
    // HP 편집 가능한 값 클릭 시 수정
    const hpEditableValue = wrapper.querySelector('.enemy-bar-hp-text .editable-value[data-type="hp"]');
    if (hpEditableValue) {
      hpEditableValue.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditingHP(hpEditableValue, token.actor);
      });
    }
    
    // 침식률 편집 가능한 값 클릭 시 수정
    const encEditableValue = wrapper.querySelector('.enemy-bar-enc-text .editable-value[data-type="enc"]');
    if (encEditableValue) {
      encEditableValue.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditingEncroachment(encEditableValue, token.actor);
      });
    }
  }
  
  return wrapper;
}

// Enemy HUD Row 업데이트
function updateEnemyHUDRow(wrapper, token) {
  const actor = token.actor;
  const hp = actor.system.attributes.hp.value;
  const maxHp = actor.system.attributes.hp.max;
  const enc = actor.system.attributes.encroachment.value ?? 0;
  
  // HP 퍼센트 계산
  const hpPct = Math.clamp(hp / maxHp, 0, 1) * 100;
  
  // 이전 침식률 값 가져오기 (순차 애니메이션용)
  // dataset에 저장된 값이 없으면 현재 DOM의 실제 값에서 역산
  let prevEnc = parseInt(wrapper.dataset.encroachment || '');
  if (isNaN(prevEnc)) {
    // DOM에서 현재 침식률 값 역산
    const fill1 = wrapper.querySelector(".enemy-bar-enc .enemy-enc-fill-1");
    const fill2 = wrapper.querySelector(".enemy-bar-enc .enemy-enc-fill-2");
    const fill3 = wrapper.querySelector(".enemy-bar-enc .enemy-enc-fill-3");
    
    if (fill1 && fill2 && fill3) {
      const seg1Width = parseFloat(fill1.style.width) || 0;
      const seg2Width = parseFloat(fill2.style.width) || 0;
      const seg3Width = parseFloat(fill3.style.width) || 0;
      prevEnc = Math.min(seg1Width, 100) + Math.min(seg2Width, 100) + Math.min(seg3Width, 100);
    } else {
      prevEnc = enc; // 요소가 없으면 현재 값과 같다고 가정
    }
  }
  
  // 값이 변경되지 않았으면 애니메이션 없이 즉시 적용
  if (prevEnc === enc) {
    wrapper.dataset.encroachment = enc;
    const fill1 = wrapper.querySelector(".enemy-bar-enc .enemy-enc-fill-1");
    const fill2 = wrapper.querySelector(".enemy-bar-enc .enemy-enc-fill-2");
    const fill3 = wrapper.querySelector(".enemy-bar-enc .enemy-enc-fill-3");
    
    const seg1 = Math.min(enc, 100);
    const seg2 = enc > 100 ? Math.min(enc - 100, 100) : 0;
    const seg3 = enc > 200 ? Math.min(enc - 200, 100) : 0;
    
    if (fill1) fill1.style.width = `${seg1}%`;
    if (fill2) fill2.style.width = `${seg2}%`;
    if (fill3) fill3.style.width = `${seg3}%`;
  } else {
    wrapper.dataset.encroachment = enc;
  }
  
  // 침식률 구간 계산 (0-100, 101-200, 201-300)
  const seg1 = Math.min(enc, 100);
  const seg2 = enc > 100 ? Math.min(enc - 100, 100) : 0;
  const seg3 = enc > 200 ? Math.min(enc - 200, 100) : 0;
  
  // HP 색상 (초록 → 빨강 그라데이션)
  const start = { r: 0x00, g: 0x82, b: 0x26 };
  const end = { r: 0xd3, g: 0x2d, b: 0x14 };
  const t = hpPct / 100;
  const r = Math.round(start.r * t + end.r * (1 - t));
  const g = Math.round(start.g * t + end.g * (1 - t));
  const b = Math.round(start.b * t + end.b * (1 - t));
  const hpColor = `rgb(${r},${g},${b})`;
  
  // HP 바 적용
  wrapper.querySelector(".enemy-bar-hp .enemy-hp-fill").style.width = `${hpPct}%`;
  wrapper.querySelector(".enemy-bar-hp .enemy-hp-fill").style.background = hpColor;
  
  // HP 텍스트 업데이트 (GM만 표시)
  const hpTextElement = wrapper.querySelector(".enemy-bar-hp-text");
  if (hpTextElement) {
    if (game.user.isGM) {
      hpTextElement.innerHTML = `<span class="editable-value" data-type="hp">${hp}</span>/${maxHp}`;
    } else {
      hpTextElement.innerHTML = '';
    }
  }
  
  // 침식률 바 적용 (순차적으로)
  const fill1 = wrapper.querySelector(".enemy-bar-enc .enemy-enc-fill-1");
  const fill2 = wrapper.querySelector(".enemy-bar-enc .enemy-enc-fill-2");
  const fill3 = wrapper.querySelector(".enemy-bar-enc .enemy-enc-fill-3");
  
  // 값이 변경되지 않았으면 애니메이션 없이 건너뛰기 (이미 위에서 즉시 적용됨)
  if (prevEnc !== enc) {
    // 증가하는 경우: seg1 → seg2 → seg3 순차적으로
    if (enc > prevEnc) {
      // seg1 먼저 설정
      if (fill1) fill1.style.width = `${seg1}%`;
      
      // seg1이 100%일 때만 seg2 설정 (300ms 후)
      if (seg1 >= 100) {
        setTimeout(() => {
          if (fill2) fill2.style.width = `${seg2}%`;
        }, 300);
      } else {
        if (fill2) fill2.style.width = '0%';
        if (fill3) fill3.style.width = '0%';
      }
      
      // seg2가 100%일 때만 seg3 설정 (600ms 후)
      if (seg1 >= 100 && seg2 >= 100) {
        setTimeout(() => {
          if (fill3) fill3.style.width = `${seg3}%`;
        }, 600);
      } else if (seg2 < 100) {
        if (fill3) fill3.style.width = '0%';
      }
    }
    // 감소하는 경우: seg3 → seg2 → seg1 역순으로
    else if (enc < prevEnc) {
      // seg3부터 설정
      if (fill3) fill3.style.width = `${seg3}%`;
      
      // 300ms 후 seg2 설정
      setTimeout(() => {
        if (fill2) fill2.style.width = `${seg2}%`;
      }, 300);
      
      // 600ms 후 seg1 설정
      setTimeout(() => {
        if (fill1) fill1.style.width = `${seg1}%`;
      }, 600);
    }
  }
  
  // 침식률 텍스트 업데이트 (GM만 표시)
  const encTextElement = wrapper.querySelector(".enemy-bar-enc-text");
  if (encTextElement) {
    if (game.user.isGM) {
      encTextElement.innerHTML = `<span class="editable-value" data-type="enc">${enc}</span>%`;
    } else {
      encTextElement.innerHTML = '';
    }
  }
  
  // 아이콘 업데이트 (HUD 설정이 있으면 사용)
  const img = wrapper.querySelector(".enemy-ui-icon");
  const hudImage = actor.getFlag('lichsoma-dx3rd-hud', 'hudImage');
  const hudOffsetX = actor.getFlag('lichsoma-dx3rd-hud', 'hudOffsetX');
  const hudOffsetY = actor.getFlag('lichsoma-dx3rd-hud', 'hudOffsetY');
  const hudScale = actor.getFlag('lichsoma-dx3rd-hud', 'hudScale');
  
  // HUD 이미지 설정
  if (hudImage && hudImage !== actor.img) {
    img.src = hudImage;
    img.classList.remove('actor-image');
    img.classList.add('hud-image');
  } else {
    img.src = actor.img;
    img.classList.remove('hud-image');
    img.classList.add('actor-image');
  }
  
  // HUD 오프셋 및 스케일 설정
  let transformParts = ['skewX(20deg)', 'translate(-50%, -50%)'];
  
  // 오프셋 설정 (기본값 사용)
  const finalOffsetX = hudOffsetX !== null && hudOffsetX !== undefined ? hudOffsetX : 50;
  const finalOffsetY = hudOffsetY !== null && hudOffsetY !== undefined ? hudOffsetY : 50;
  const finalScale = hudScale !== null && hudScale !== undefined ? hudScale : 100;
  
  img.style.left = `${finalOffsetX}%`;
  img.style.top = `${finalOffsetY}%`;
  
  if (finalScale !== 100) {
    transformParts.push(`scale(${finalScale / 100})`);
  }
  
  img.style.transform = transformParts.join(' ');
  
  // 이름 업데이트
  const actorNameElement = wrapper.querySelector(".enemy-ui-actor-name");
  actorNameElement.textContent = actor.name;
  
  // GM만 has-permission 클래스 추가 (스타일 유지)
  if (game.user.isGM) {
    actorNameElement.classList.add('has-permission');
    
    // HP바와 침식률바에도 has-permission 클래스 추가
    const hpBar = wrapper.querySelector('.enemy-bar-hp');
    const hpText = wrapper.querySelector('.enemy-bar-hp-text');
    const encBar = wrapper.querySelector('.enemy-bar-enc');
    const encText = wrapper.querySelector('.enemy-bar-enc-text');
    
    if (hpBar) hpBar.classList.add('has-permission');
    if (hpText) hpText.classList.add('has-permission');
    if (encBar) encBar.classList.add('has-permission');
    if (encText) encText.classList.add('has-permission');
    
    // HP와 침식률 편집 가능한 값에 이벤트 리스너 다시 추가 (innerHTML로 교체되어 이벤트가 사라졌을 수 있음)
    const hpEditableValue = wrapper.querySelector('.enemy-bar-hp-text .editable-value[data-type="hp"]');
    if (hpEditableValue && !hpEditableValue.dataset.listenerAttached) {
      hpEditableValue.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditingHP(hpEditableValue, actor);
      });
      hpEditableValue.dataset.listenerAttached = 'true';
    }
    
    const encEditableValue = wrapper.querySelector('.enemy-bar-enc-text .editable-value[data-type="enc"]');
    if (encEditableValue && !encEditableValue.dataset.listenerAttached) {
      encEditableValue.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditingEncroachment(encEditableValue, actor);
      });
      encEditableValue.dataset.listenerAttached = 'true';
    }
  } else {
    actorNameElement.classList.remove('has-permission');
    
    // HP바와 침식률바에서도 has-permission 클래스 제거
    const hpBar = wrapper.querySelector('.enemy-bar-hp');
    const hpText = wrapper.querySelector('.enemy-bar-hp-text');
    const encBar = wrapper.querySelector('.enemy-bar-enc');
    const encText = wrapper.querySelector('.enemy-bar-enc-text');
    
    if (hpBar) hpBar.classList.remove('has-permission');
    if (hpText) hpText.classList.remove('has-permission');
    if (encBar) encBar.classList.remove('has-permission');
    if (encText) encText.classList.remove('has-permission');
  }
  
  // 상태이상 아이콘 표시
  const cond = wrapper.querySelector(".enemy-condition-container");
  cond.innerHTML = '';
  actor.effects.filter(e => !e.disabled).forEach(e => {
    const box = document.createElement('div');
    box.className = 'enemy-condition-icon-box';
    box.title = e.name;
    
    const icon = document.createElement('img');
    icon.src = e.img;
    icon.alt = e.name;
    
    box.appendChild(icon);
    cond.appendChild(box);
  });
}

// 액터 시트에 HUD 버튼 추가
Hooks.on('renderActorSheet', (app, html, data) => {
  // DX3rd 시스템의 액터 시트인지 확인
  if (!app.actor) return;
  
  // 소유권 확인: OWNER 권한이 있는 경우에만 버튼 추가
  const ownershipLevel = app.actor.ownership[game.userId];
  if (ownershipLevel !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) return;
  
  // 헤더에 HUD 버튼 추가
  const windowHeader = html.find('.window-header');
  if (!windowHeader.length) return;
  
  // 이미 버튼이 있으면 추가하지 않음
  if (windowHeader.find('.hud-image-button').length) return;
  
  // HUD 버튼 생성
  const hudButton = $(`
    <a class="hud-image-button" title="${game.i18n.localize('DX3rdHUD.ImageSettings.ButtonTitle')}">
      <i class="fa-solid fa-heart-pulse"></i> HUD
    </a>
  `);
  
  // 버튼 클릭 이벤트
  hudButton.on('click', () => {
    openHUDImageDialog(app.actor);
  });
  
  // 닫기 버튼 앞에 추가
  windowHeader.find('.close').before(hudButton);
});

// HUD 이미지 설정 다이얼로그
function openHUDImageDialog(actor) {
  // 현재 HUD 이미지 설정 가져오기
  const currentHudImage = actor.getFlag('lichsoma-dx3rd-hud', 'hudImage') || actor.img;
  const currentOffsetX = actor.getFlag('lichsoma-dx3rd-hud', 'hudOffsetX') || 50;
  const currentOffsetY = actor.getFlag('lichsoma-dx3rd-hud', 'hudOffsetY') || 50;
  const currentScale = actor.getFlag('lichsoma-dx3rd-hud', 'hudScale') || 100;
  
  // 미리보기 크기 계산
  // 실제 HUD: 프레임 180x72, 이미지 width: 120% = 216px
  // 미리보기: 프레임 240x96, 이미지 width: 120% = 288px
  const previewFrameWidth = 240;
  const previewFrameHeight = 85;
  const previewImageWidth = previewFrameWidth * 1.2; // 프레임 width의 120%
  
  // 다이얼로그 생성
  new Dialog({
    title: game.i18n.format('DX3rdHUD.ImageSettings.Title', { name: actor.name }),
    content: `
      <form>
        <div class="form-group">
          <label>${game.i18n.localize('DX3rdHUD.ImageSettings.ImagePath')}</label>
          <div style="display: flex; gap: 5px;">
            <input type="text" name="hudImage" value="${currentHudImage}" style="flex: 1;" />
            <button type="button" class="file-picker" data-type="imagevideo" data-target="hudImage">
              <i class="fas fa-file-import fa-fw"></i>
            </button>
          </div>
          <p class="notes">${game.i18n.localize('DX3rdHUD.ImageSettings.ImagePathHint')}</p>
        </div>
        
        <div class="form-group">
          <label>${game.i18n.localize('DX3rdHUD.ImageSettings.OffsetX')}: <span class="offset-value">${currentOffsetX}%</span></label>
          <input type="range" name="hudOffsetX" min="-50" max="150" step="1" value="${currentOffsetX}" />
        </div>
        
        <div class="form-group">
          <label>${game.i18n.localize('DX3rdHUD.ImageSettings.OffsetY')}: <span class="offset-value">${currentOffsetY}%</span></label>
          <input type="range" name="hudOffsetY" min="-50" max="150" step="1" value="${currentOffsetY}" />
        </div>
        
        <div class="form-group">
          <label>${game.i18n.localize('DX3rdHUD.ImageSettings.Scale')}: <span class="offset-value">${currentScale}%</span></label>
          <input type="range" name="hudScale" min="50" max="200" step="5" value="${currentScale}" />
        </div>
        
        <div class="form-group">
          <label>${game.i18n.localize('DX3rdHUD.ImageSettings.Preview')}</label>
          <div style="width: 350px; height: 100px; position: relative; margin: 10px auto; overflow: hidden; display: flex; align-items: center; justify-content: center;">
            <div style="width: ${previewFrameWidth}px; height: ${previewFrameHeight}px; border: 2px solid #111; background: #333; position: relative; overflow: hidden; transform: skewX(-20deg); transform-origin: right;">
              <img id="hud-preview" src="${currentHudImage}" style="position: absolute; width: ${previewImageWidth}px; object-fit: contain; left: ${currentOffsetX}%; top: ${currentOffsetY}%; transform: skewX(20deg) translate(-50%, -50%) scale(${currentScale / 100}); transform-origin: left; background-color: rgba(128, 128, 128, 0.5);" />
            </div>
          </div>
        </div>
      </form>
    `,
    buttons: {
      save: {
        icon: '<i class="fas fa-check"></i>',
        label: game.i18n.localize('DX3rdHUD.ImageSettings.Save'),
        callback: (html) => {
          const hudImage = html.find('[name="hudImage"]').val();
          const hudOffsetX = parseInt(html.find('[name="hudOffsetX"]').val());
          const hudOffsetY = parseInt(html.find('[name="hudOffsetY"]').val());
          const hudScale = parseInt(html.find('[name="hudScale"]').val());
          
          // Flag에 저장
          actor.setFlag('lichsoma-dx3rd-hud', 'hudImage', hudImage || actor.img);
          actor.setFlag('lichsoma-dx3rd-hud', 'hudOffsetX', hudOffsetX);
          actor.setFlag('lichsoma-dx3rd-hud', 'hudOffsetY', hudOffsetY);
          actor.setFlag('lichsoma-dx3rd-hud', 'hudScale', hudScale);
          
          ui.notifications.info(game.i18n.format('DX3rdHUD.ImageSettings.SaveSuccess', { name: actor.name }));
          
          // HUD 업데이트
          const state = getSceneHudState();
          if (state.playerHudVisible) updatePlayerHUD();
          if (state.enemyHudVisible) updateEnemyHUD();
        }
      },
      reset: {
        icon: '<i class="fas fa-undo"></i>',
        label: game.i18n.localize('DX3rdHUD.ImageSettings.Reset'),
        callback: () => {
          actor.unsetFlag('lichsoma-dx3rd-hud', 'hudImage');
          actor.unsetFlag('lichsoma-dx3rd-hud', 'hudOffsetX');
          actor.unsetFlag('lichsoma-dx3rd-hud', 'hudOffsetY');
          actor.unsetFlag('lichsoma-dx3rd-hud', 'hudScale');
          
          ui.notifications.info(game.i18n.format('DX3rdHUD.ImageSettings.ResetSuccess', { name: actor.name }));
          
          // HUD 업데이트
          const state = getSceneHudState();
          if (state.playerHudVisible) updatePlayerHUD();
          if (state.enemyHudVisible) updateEnemyHUD();
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize('DX3rdHUD.ImageSettings.Cancel')
      }
    },
    default: 'save',
    render: (html) => {
      // 파일 피커 이벤트
      html.find('.file-picker').on('click', async (event) => {
        const button = event.currentTarget;
        const input = html.find('[name="hudImage"]');
        
        const fp = new FilePicker({
          type: 'imagevideo',
          current: input.val(),
          callback: (path) => {
            input.val(path);
            html.find('#hud-preview').attr('src', path);
          }
        });
        
        fp.render(true);
      });
      
      // 슬라이더 변경 시 미리보기 업데이트
      html.find('[name="hudOffsetX"]').on('input', (e) => {
        const value = e.target.value;
        html.find('[name="hudOffsetX"]').siblings('label').find('.offset-value').text(`${value}%`);
        updatePreviewTransform(html);
      });
      
      html.find('[name="hudOffsetY"]').on('input', (e) => {
        const value = e.target.value;
        html.find('[name="hudOffsetY"]').siblings('label').find('.offset-value').text(`${value}%`);
        updatePreviewTransform(html);
      });
      
      html.find('[name="hudScale"]').on('input', (e) => {
        const value = e.target.value;
        html.find('[name="hudScale"]').siblings('label').find('.offset-value').text(`${value}%`);
        updatePreviewTransform(html);
      });
      
      // 미리보기 transform 업데이트 헬퍼 함수
      function updatePreviewTransform(html) {
        const x = html.find('[name="hudOffsetX"]').val();
        const y = html.find('[name="hudOffsetY"]').val();
        const scale = html.find('[name="hudScale"]').val() / 100;
        html.find('#hud-preview').css({
          'left': `${x}%`,
          'top': `${y}%`,
          'transform': `skewX(20deg) translate(-50%, -50%) scale(${scale})`
        });
      }
      
      // 슬라이더 값 업데이트 헬퍼 함수
      function updateSliderValue(html, name, value) {
        const slider = html.find(`[name="${name}"]`);
        slider.val(value);
        slider.siblings('label').find('.offset-value').text(`${value}%`);
        updatePreviewTransform(html);
      }
      
      // 이미지 경로 변경 시 미리보기 업데이트
      html.find('[name="hudImage"]').on('change', (e) => {
        html.find('#hud-preview').attr('src', e.target.value);
      });
      
      // 미리보기 이미지 인터랙티브 조작
      const preview = html.find('#hud-preview')[0];
      const previewContainer = preview.parentElement;
      
      // 드래그 상태 변수
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let startOffsetX = 0;
      let startOffsetY = 0;
      
      // 마우스 휠로 스케일 조절
      preview.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const currentScale = parseInt(html.find('[name="hudScale"]').val());
        const delta = e.deltaY > 0 ? -5 : 5; // 휠 방향에 따라 증감
        let newScale = currentScale + delta;
        
        // 범위 제한 (50 ~ 200)
        newScale = Math.max(50, Math.min(200, newScale));
        
        updateSliderValue(html, 'hudScale', newScale);
      });
      
      // 드래그로 위치 조절
      preview.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startOffsetX = parseInt(html.find('[name="hudOffsetX"]').val());
        startOffsetY = parseInt(html.find('[name="hudOffsetY"]').val());
        
        // 커서 변경
        preview.style.cursor = 'grabbing';
      });
      
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        e.preventDefault();
        
        // 컨테이너 크기 기준으로 이동량 계산
        const containerRect = previewContainer.getBoundingClientRect();
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        
        // 픽셀 이동량을 퍼센트로 변환 (컨테이너 크기 기준)
        const percentDeltaX = (deltaX / containerRect.width) * 100;
        const percentDeltaY = (deltaY / containerRect.height) * 100;
        
        let newOffsetX = startOffsetX + percentDeltaX;
        let newOffsetY = startOffsetY + percentDeltaY;
        
        // 범위 제한 (-50 ~ 150)
        newOffsetX = Math.max(-50, Math.min(150, newOffsetX));
        newOffsetY = Math.max(-50, Math.min(150, newOffsetY));
        
        // 정수로 반올림
        newOffsetX = Math.round(newOffsetX);
        newOffsetY = Math.round(newOffsetY);
        
        updateSliderValue(html, 'hudOffsetX', newOffsetX);
        updateSliderValue(html, 'hudOffsetY', newOffsetY);
      });
      
      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          preview.style.cursor = 'grab';
        }
      });
      
      // 초기 커서 스타일 설정
      preview.style.cursor = 'grab';
      preview.style.userSelect = 'none';
    }
  }, {
    width: 500
  }).render(true);
}

// ======================
// HUD 폰트 설정 관련 함수
// ======================

// 폰트 선택 옵션 업데이트 상태
let _fontChoicesUpdated = false;

/**
 * HUD 설정 등록
 */
function registerHUDSettings() {
  // 초기 폰트 목록
  const defaultFontLabel = game.i18n?.localize("DX3rdHUD.DefaultFont") || "기본 폰트";
  const initialFonts = {
    'default': defaultFontLabel,
    'Arial': 'Arial',
    'Times New Roman': 'Times New Roman',
    'Courier New': 'Courier New',
    'Verdana': 'Verdana',
    'Georgia': 'Georgia'
  };

  // HUD 이름 폰트 설정
  game.settings.register(MODULE_ID, "hudNameFont", {
    name: game.i18n.localize("DX3rdHUD.HUDNameFont"),
    hint: game.i18n.localize("DX3rdHUD.HUDNameFontHint"),
    scope: "world",
    config: true,
    type: String,
    choices: initialFonts,
    default: "default",
    onChange: () => {
      applyHUDNameFont();
    }
  });
  
  // 승화 컷인 사운드 설정
  game.settings.register(MODULE_ID, "sublimationSound", {
    name: game.i18n.localize("DX3rdHUD.SublimationSound"),
    hint: game.i18n.localize("DX3rdHUD.SublimationSoundHint"),
    scope: "world",
    config: true,
    type: String,
    filePicker: "audio",
    default: ""
  });
  
  // 승화 컷인 사운드 볼륨 설정
  game.settings.register(MODULE_ID, "sublimationSoundVolume", {
    name: game.i18n.localize("DX3rdHUD.SublimationSoundVolume"),
    hint: game.i18n.localize("DX3rdHUD.SublimationSoundVolumeHint"),
    scope: "world",
    config: true,
    type: Number,
    range: {
      min: 0,
      max: 1,
      step: 0.1
    },
    default: 0.5
  });
  
  // 전투 시작 시 플레이어 HUD 자동 활성화
  game.settings.register(MODULE_ID, "autoEnablePlayerHUDOnCombatStart", {
    name: game.i18n.localize("DX3rdHUD.AutoEnablePlayerHUDOnCombatStart"),
    hint: game.i18n.localize("DX3rdHUD.AutoEnablePlayerHUDOnCombatStartHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
  
  // 전투 시작 시 에너미 HUD 자동 활성화
  game.settings.register(MODULE_ID, "autoEnableEnemyHUDOnCombatStart", {
    name: game.i18n.localize("DX3rdHUD.AutoEnableEnemyHUDOnCombatStart"),
    hint: game.i18n.localize("DX3rdHUD.AutoEnableEnemyHUDOnCombatStartHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
  
  // 전투 종료 시 플레이어 HUD 자동 비활성화
  game.settings.register(MODULE_ID, "autoDisablePlayerHUDOnCombatEnd", {
    name: game.i18n.localize("DX3rdHUD.AutoDisablePlayerHUDOnCombatEnd"),
    hint: game.i18n.localize("DX3rdHUD.AutoDisablePlayerHUDOnCombatEndHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
  
  // 전투 종료 시 에너미 HUD 자동 비활성화
  game.settings.register(MODULE_ID, "autoDisableEnemyHUDOnCombatEnd", {
    name: game.i18n.localize("DX3rdHUD.AutoDisableEnemyHUDOnCombatEnd"),
    hint: game.i18n.localize("DX3rdHUD.AutoDisableEnemyHUDOnCombatEndHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
  
  // 폰트가 로드될 때까지 기다린 후 폰트 목록 업데이트
  waitForFontsAndUpdate();
}

/**
 * 폰트 로드 완료를 기다린 후 폰트 목록 업데이트
 */
function waitForFontsAndUpdate() {
  // document.fonts.ready를 사용하여 폰트 로드 완료 대기
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      // 폰트 로드 완료 후 약간의 딜레이를 두고 업데이트 (CONFIG.fontDefinitions 준비 대기)
      setTimeout(() => {
        updateHUDFontChoices();
      }, 500);
    }).catch(() => {
      // 폰트 API 실패 시 폴백으로 일정 시간 후 업데이트
      setTimeout(() => {
        updateHUDFontChoices();
      }, 1000);
    });
  } else {
    // 폰트 API가 없는 경우 폴백
    setTimeout(() => {
      updateHUDFontChoices();
    }, 1000);
  }
  
  // 최대 대기 시간 설정 (1초 후에는 강제로 업데이트)
  setTimeout(() => {
    updateHUDFontChoices();
  }, 1000);
}

/**
 * 폰트 선택 옵션 업데이트
 */
function updateHUDFontChoices() {
  // 이미 업데이트된 경우 스킵 (중복 실행 방지)
  if (_fontChoicesUpdated) {
    return;
  }

  try {
    const availableFonts = getAvailableFonts();
    
    // 현재 선택된 폰트 값 가져오기
    const currentFont = game.settings.get(MODULE_ID, "hudNameFont");
    
    // 현재 선택된 폰트가 새 목록에 없으면 추가
    if (currentFont && currentFont !== 'default' && !availableFonts[currentFont]) {
      availableFonts[currentFont] = currentFont;
    }
    
    // 설정 메뉴에서 폰트 선택 옵션 업데이트
    const setting = game.settings.settings.get(`${MODULE_ID}.hudNameFont`);
    if (setting) {
      setting.choices = availableFonts;
      _fontChoicesUpdated = true;
    }
  } catch (error) {
  }
}

/**
 * 브라우저에서 사용 가능한 폰트 목록 가져오기
 */
function getAvailableFonts() {
  try {
    let loadedFonts = [];
    
    // 방법 1: CONFIG.fontDefinitions.keys에서 폰트 가져오기
    try {
      const configFonts = Object.keys(CONFIG.fontDefinitions || {});
      loadedFonts = [...loadedFonts, ...configFonts];
    } catch (e) {
    }
    
    // 방법 2: document.fonts API 사용
    try {
      if (document.fonts && document.fonts.forEach) {
        document.fonts.forEach(font => {
          const family = font.family;
          if (family && typeof family === 'string') {
            loadedFonts.push(family);
          }
        });
      }
    } catch (e) {
    }
    
    // 제외할 폰트들
    const excludePatterns = [
      'modesto condensed',
      'modesto',
      'amiri',
      'font awesome',
      'fontawesome',
      'fallback'
    ];
    
    // 필터링 및 중복 제거
    const filteredFonts = loadedFonts.filter(font => {
      if (!font || typeof font !== 'string') return false;
      const lowerFont = font.toLowerCase();
      return !excludePatterns.some(pattern => lowerFont.includes(pattern));
    });
    
    const uniqueFonts = [...new Set(filteredFonts)];
    
    // 기본 폰트와 결합 (default는 항상 포함)
    const allFonts = ['default', ...uniqueFonts.filter(f => f !== 'default')];
    
    // 폰트 정렬: default를 제외하고 한글, 영어, 숫자 순으로 정렬
    const sortedFonts = allFonts.sort((a, b) => {
      // default는 항상 맨 앞
      if (a === 'default') return -1;
      if (b === 'default') return 1;
      
      // 나머지는 localeCompare로 정렬 (한글, 영어, 숫자 순)
      return a.localeCompare(b, ['ko', 'en'], { numeric: true, sensitivity: 'base' });
    });
    
    // 선택 객체 생성
    const fontChoices = {};
    const defaultFontLabel = game.i18n?.localize("DX3rdHUD.DefaultFont") || "기본 폰트";
    sortedFonts.forEach(font => {
      if (font === 'default') {
        fontChoices[font] = defaultFontLabel;
      } else {
        fontChoices[font] = font;
      }
    });
    
    return fontChoices;
  } catch (error) {
    const defaultFontLabel = game.i18n?.localize("DX3rdHUD.DefaultFont") || "기본 폰트";
    return {
      'default': defaultFontLabel,
      'Arial': 'Arial',
      'Times New Roman': 'Times New Roman',
      'Courier New': 'Courier New',
      'Verdana': 'Verdana',
      'Georgia': 'Georgia'
    };
  }
}

/**
 * HUD 이름 폰트 적용
 */
function applyHUDNameFont() {
  try {
    const selectedFont = game.settings.get(MODULE_ID, "hudNameFont");
    
    // 폰트 설정
    let fontFamily = "Arial, sans-serif";
    if (selectedFont !== 'default') {
      fontFamily = `"${selectedFont}", Arial, sans-serif`;
    }
    
    // 기존 스타일 제거
    const existingStyle = document.getElementById('lichsoma-hud-name-font-style');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // 새로운 스타일 생성
    const style = document.createElement('style');
    style.id = 'lichsoma-hud-name-font-style';
    
    // CSS 생성 - 더 구체적인 선택자 사용
    style.textContent = `
      /* HUD 이름 폰트 오버라이드 */
      #dx3rd-player-hud .pc-ui-actor-name,
      .dx3rd-hud-players-list .pc-ui-actor-name,
      .pc-ui-row .pc-ui-actor-name,
      div.pc-ui-actor-name,
      #dx3rd-enemy-hud .enemy-ui-actor-name,
      .dx3rd-hud-enemies-list .enemy-ui-actor-name,
      .enemy-ui-row .enemy-ui-actor-name,
      div.enemy-ui-actor-name {
        font-family: ${fontFamily} !important;
      }
    `;
    
    document.head.appendChild(style);
  } catch (error) {
  }
}

/**
 * HP 값 직접 편집
 */
function startEditingHP(editableSpan, actor) {
  if (!actor || !actor.isOwner) return;
  
  // 이미 편집 중이면 무시
  const parent = editableSpan.parentElement;
  if (parent.querySelector('.pc-bar-hp-input')) return;
  
  const currentHP = actor.system.attributes.hp.value;
  const maxHP = actor.system.attributes.hp.max;
  const originalText = editableSpan.textContent;
  
  // Input 요소 생성
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'pc-bar-hp-input';
  input.value = currentHP;
  
  // 중복 호출 방지 플래그
  let isCleaningUp = false;
  
  // 저장 함수
  const saveValue = () => {
    const inputValue = input.value.trim();
    let newHP = currentHP;
    
    // 상대값 처리 (+10, -5 등)
    if (inputValue.startsWith('+')) {
      const delta = parseInt(inputValue.substring(1));
      if (!isNaN(delta)) {
        newHP = currentHP + delta;
      }
    } else if (inputValue.startsWith('-')) {
      const delta = parseInt(inputValue.substring(1));
      if (!isNaN(delta)) {
        newHP = currentHP - delta;
      }
    } else {
      // 절대값 처리
      const parsed = parseInt(inputValue);
      if (!isNaN(parsed)) {
        newHP = parsed;
      }
    }
    
    // 값이 변경되었고 유효한 범위 내인 경우에만 업데이트
    if (newHP !== currentHP) {
      newHP = Math.clamp(newHP, 0, maxHP);
      actor.update({
        'system.attributes.hp.value': newHP
      });
    }
    cleanupInput();
  };
  
  // 정리 함수
  const cleanupInput = () => {
    // 중복 호출 방지
    if (isCleaningUp) return;
    isCleaningUp = true;
    
    try {
      // input 제거 시도 (이미 제거되었을 수 있으므로 try-catch로 감싸기)
      if (input && input.parentNode) {
        input.remove();
      }
    } catch (e) {
      // 이미 제거되었거나 다른 문제가 있는 경우 무시
    }
    
    try {
      // span이 여전히 존재하는 경우에만 display 복원
      if (editableSpan && editableSpan.parentElement) {
        editableSpan.style.display = '';
      }
    } catch (e) {
      // span이 이미 제거된 경우 무시
    }
    
    isCleaningUp = false;
  };
  
  // 이벤트 리스너
  input.addEventListener('blur', saveValue);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveValue();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cleanupInput();
    }
    e.stopPropagation();
  });
  
  input.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  // span 숨기고 input 추가
  editableSpan.style.display = 'none';
  editableSpan.parentElement.insertBefore(input, editableSpan);
  input.focus();
  input.select();
}

/**
 * 침식률 값 직접 편집
 */
function startEditingEncroachment(editableSpan, actor) {
  if (!actor || !actor.isOwner) return;
  
  // 이미 편집 중이면 무시
  const parent = editableSpan.parentElement;
  if (parent.querySelector('.pc-bar-enc-input')) return;
  
  const currentEnc = actor.system.attributes.encroachment.value ?? 0;
  const originalText = editableSpan.textContent;
  
  // Input 요소 생성
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'pc-bar-enc-input';
  input.value = currentEnc;
  
  // 중복 호출 방지 플래그
  let isCleaningUp = false;
  
  // 저장 함수
  const saveValue = () => {
    const inputValue = input.value.trim();
    let newEnc = currentEnc;
    
    // 상대값 처리 (+10, -5 등)
    if (inputValue.startsWith('+')) {
      const delta = parseInt(inputValue.substring(1));
      if (!isNaN(delta)) {
        newEnc = currentEnc + delta;
      }
    } else if (inputValue.startsWith('-')) {
      const delta = parseInt(inputValue.substring(1));
      if (!isNaN(delta)) {
        newEnc = currentEnc - delta;
      }
    } else {
      // 절대값 처리
      const parsed = parseInt(inputValue);
      if (!isNaN(parsed)) {
        newEnc = parsed;
      }
    }
    
    // 값이 변경되었고 유효한 범위 내인 경우에만 업데이트
    if (newEnc !== currentEnc) {
      newEnc = Math.max(0, newEnc);
      actor.update({
        'system.attributes.encroachment.value': newEnc
      });
    }
    cleanupInput();
  };
  
  // 정리 함수
  const cleanupInput = () => {
    // 중복 호출 방지
    if (isCleaningUp) return;
    isCleaningUp = true;
    
    try {
      // input 제거 시도 (이미 제거되었을 수 있으므로 try-catch로 감싸기)
      if (input && input.parentNode) {
        input.remove();
      }
    } catch (e) {
      // 이미 제거되었거나 다른 문제가 있는 경우 무시
    }
    
    try {
      // span이 여전히 존재하는 경우에만 display 복원
      if (editableSpan && editableSpan.parentElement) {
        editableSpan.style.display = '';
      }
    } catch (e) {
      // span이 이미 제거된 경우 무시
    }
    
    isCleaningUp = false;
  };
  
  // 이벤트 리스너
  input.addEventListener('blur', saveValue);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveValue();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cleanupInput();
    }
    e.stopPropagation();
  });
  
  input.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  // span 숨기고 input 추가
  editableSpan.style.display = 'none';
  editableSpan.parentElement.insertBefore(input, editableSpan);
  input.focus();
  input.select();
}

/**
 * 현재 턴 액터의 HUD Row에 하이라이트 적용
 */
function updateCurrentTurnHighlight() {
  // 모든 Player HUD Row에서 current-turn 클래스 제거
  const playerRows = document.querySelectorAll('#dx3rd-hud-players-list .pc-ui-row');
  playerRows.forEach(row => row.classList.remove('current-turn'));
  
  // 모든 Enemy HUD Row에서 current-turn 클래스 제거
  const enemyRows = document.querySelectorAll('#dx3rd-hud-enemies-list .enemy-ui-row');
  enemyRows.forEach(row => row.classList.remove('current-turn'));
  
  // 전투가 진행 중인지 확인
  if (!game.combat || !game.combat.started) return;
  
  // 현재 턴의 combatant 가져오기
  const currentCombatant = game.combat.combatant;
  if (!currentCombatant || !currentCombatant.token) return;
  
  // 프로세스 combatant 제외
  const isProcess = currentCombatant.getFlag('double-cross-3rd', 'isProcessCombatant');
  if (isProcess) return;
  
  // 현재 턴 토큰의 ID
  const currentTokenId = currentCombatant.token.id;
  
  // Player HUD에서 해당 토큰의 Row 찾기
  const playerRow = document.querySelector(`#dx3rd-hud-players-list .pc-ui-row[data-token-id="${currentTokenId}"]`);
  if (playerRow) {
    playerRow.classList.add('current-turn');
  }
  
  // Enemy HUD에서 해당 토큰의 Row 찾기
  const enemyRow = document.querySelector(`#dx3rd-hud-enemies-list .enemy-ui-row[data-token-id="${currentTokenId}"]`);
  if (enemyRow) {
    enemyRow.classList.add('current-turn');
  }
}
