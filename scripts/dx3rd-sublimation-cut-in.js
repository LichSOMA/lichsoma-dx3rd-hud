// DX3rd Sublimation Cut-in Effect

Hooks.once('ready', () => {
  // 소켓 리스너 등록
  game.socket.on("module.lichsoma-dx3rd-hud", (data) => {
    if (data.type === "showSublimationCutIn") {
      // 액터 가져오기
      const actor = game.actors.get(data.actorId);
      if (actor) {
        // 전달받은 색상을 사용하여 컷인 표시
        showSublimationCutIn(actor, null, data.actionNumber, data.userColor);
      }
    }
  });
  
  // DX3rdRoisHandler가 존재하는지 확인
  if (!window.DX3rdRoisHandler || !window.DX3rdRoisHandler.applySublimationEffect) {
    console.warn('[DX3rd HUD] DX3rdRoisHandler.applySublimationEffect를 찾을 수 없습니다. 승화 컷인 기능이 비활성화됩니다.');
    return;
  }
  
  // 원본 함수 저장
  const originalApplySublimationEffect = window.DX3rdRoisHandler.applySublimationEffect;
  
  // 함수 래핑
  window.DX3rdRoisHandler.applySublimationEffect = async function(actor, item, actionNumber) {
    // 액터 소유자의 색상 가져오기 (다른 플레이어에게도 전달하기 위해)
    let userColorToSend = '#8a2be2';
    try {
      if (game.user && game.user.color) {
        userColorToSend = String(game.user.color);
      } else {
        const ownerUser = game.users.find(u => actor.testUserPermission(u, "OWNER"));
        if (ownerUser && ownerUser.color) {
          userColorToSend = String(ownerUser.color);
        }
      }
    } catch (error) {
      console.warn('[DX3rd HUD] 유저 색상 가져오기 실패:', error);
    }
    
    // 자기 자신과 다른 플레이어들에게 동시에 컷인 표시
    // await를 제거하여 즉시 다음으로 진행
    showSublimationCutIn(actor, item, actionNumber);
    
    // 다른 플레이어들에게 즉시 소켓으로 전송 (거의 동시에 실행)
    game.socket.emit("module.lichsoma-dx3rd-hud", {
      type: "showSublimationCutIn",
      actorId: actor.id,
      actionNumber: actionNumber,
      userColor: userColorToSend  // 실행자의 색상 전달
    });
    
    // 원본 함수 실행
    const result = await originalApplySublimationEffect.call(this, actor, item, actionNumber);
    
    // 원본 함수의 반환값 그대로 반환
    return result;
  };
  
  console.log('[DX3rd HUD] 승화 컷인 시스템이 활성화되었습니다.');
});

/**
 * 승화 사운드 재생
 */
function playSublimationSound() {
  try {
    const soundPath = game.settings.get('lichsoma-dx3rd-hud', 'sublimationSound');
    const volume = game.settings.get('lichsoma-dx3rd-hud', 'sublimationSoundVolume');
    
    if (soundPath && soundPath.trim() !== '') {
      foundry.audio.AudioHelper.play({
        src: soundPath,
        volume: volume,
        autoplay: true,
        loop: false
      }, true);
    }
  } catch (error) {
    console.warn('[DX3rd HUD] 승화 사운드 재생 실패:', error);
  }
}

/**
 * 승화 컷인 UI 표시
 * @param {Actor} actor - 액터
 * @param {Item} item - 아이템
 * @param {number} actionNumber - 액션 번호
 * @param {string} overrideUserColor - 강제로 사용할 유저 색상 (소켓에서 전달받은 경우)
 */
async function showSublimationCutIn(actor, item, actionNumber, overrideUserColor = null) {
  return new Promise((resolve) => {
    // 기존 컷인이 있으면 제거
    const existingCutIn = document.getElementById('dx3rd-sublimation-cut-in');
    if (existingCutIn) {
      existingCutIn.remove();
    }
    
    // 컷인 컨테이너 생성
    const cutInContainer = document.createElement('div');
    cutInContainer.id = 'dx3rd-sublimation-cut-in';
    cutInContainer.className = 'sublimation-cut-in';
    
    // 액터 이미지 URL 및 HUD 설정 가져오기
    const actorImage = actor.getFlag('lichsoma-dx3rd-hud', 'hudImage') || actor.img;
    const hudOffsetX = actor.getFlag('lichsoma-dx3rd-hud', 'hudOffsetX');
    const hudOffsetY = actor.getFlag('lichsoma-dx3rd-hud', 'hudOffsetY');
    const hudScale = actor.getFlag('lichsoma-dx3rd-hud', 'hudScale');
    
    // HUD 오프셋 및 스케일 설정 (기본값 사용)
    const finalOffsetX = hudOffsetX !== null && hudOffsetX !== undefined ? hudOffsetX : 50;
    const finalOffsetY = hudOffsetY !== null && hudOffsetY !== undefined ? hudOffsetY : 50;
    const finalScale = hudScale !== null && hudScale !== undefined ? hudScale : 100;
    
    // 액터 소유자의 유저 색상 가져오기
    let userColor = '#8a2be2'; // 기본 보라색
    
    // 소켓으로 전달받은 색상이 있으면 우선 사용
    if (overrideUserColor) {
      userColor = overrideUserColor;
    } else {
      try {
        // 방법 1: 현재 사용자의 색상을 우선 사용
        if (game.user && game.user.color) {
          // Foundry VTT의 color는 Color 객체일 수 있으므로 문자열로 변환
          const rawColor = game.user.color;
          userColor = (typeof rawColor === 'string') ? rawColor : String(rawColor);
        } else {
          // 방법 2: 액터 ownership에서 첫 번째 소유자 찾기
          if (actor.ownership) {
            for (const [userId, level] of Object.entries(actor.ownership)) {
              if (level === 3 && userId !== 'default') { // OWNER = 3
                const owner = game.users.get(userId);
                if (owner && owner.color) {
                  const rawColor = owner.color;
                  userColor = (typeof rawColor === 'string') ? rawColor : String(rawColor);
                  break;
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('[DX3rd HUD] 유저 색상을 가져오는 중 오류 발생:', error);
      }
    }
    
    // 컷인 바에서 이미지 위치 계산
    // HUD 설정의 중간점이 바의 중간에 오도록 조정
    // 이미지 높이가 300%이므로, 오프셋도 이에 맞춰 조정
    const cutInOffsetX = 50; // X 오프셋 조정 (바 중앙 기준)
    const cutInOffsetY = 50 + (finalOffsetY - 50) * 0.5; // Y 오프셋을 바 높이에 맞게 조정
    
    // HTML 구조 생성
    cutInContainer.innerHTML = `
      <div class="cut-in-background"></div>
      <div class="cut-in-content">
        <div class="cut-in-strip">
          <div class="cut-in-strip-mask">
            <img src="${actorImage}" alt="${actor.name}" class="cut-in-actor-image" 
                 style="left: ${cutInOffsetX}%; top: ${cutInOffsetY}%; transform: translate(-50%, -50%) scale(${finalScale / 100});" />
          </div>
        </div>
        <div class="cut-in-name-container">
          <div class="cut-in-actor-name">${actor.name}</div>
        </div>
      </div>
    `;
    
    // DOM에 추가
    document.body.appendChild(cutInContainer);
    
    // 유저 색상을 CSS 변수로 설정
    cutInContainer.style.setProperty('--user-color', userColor);
    
    // hex 색상을 RGB로 변환 (rgba 사용을 위해)
    try {
      // 문자열로 확실하게 변환
      const colorStr = String(userColor);
      const hex = colorStr.replace('#', '');
      
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          cutInContainer.style.setProperty('--user-color-r', r);
          cutInContainer.style.setProperty('--user-color-g', g);
          cutInContainer.style.setProperty('--user-color-b', b);
        } else {
          throw new Error('RGB 값이 유효하지 않음');
        }
      } else {
        throw new Error('Hex 색상 형식이 잘못됨');
      }
    } catch (error) {
      console.warn('[DX3rd HUD] RGB 변환 실패, 기본 색상 사용:', error);
      // 변환 실패 시 기본 보라색 사용
      cutInContainer.style.setProperty('--user-color-r', 138);
      cutInContainer.style.setProperty('--user-color-g', 43);
      cutInContainer.style.setProperty('--user-color-b', 226);
    }
    
    // 승화 사운드 재생
    playSublimationSound();
    
    // 애니메이션 시작 (약간의 지연 후)
    requestAnimationFrame(() => {
      cutInContainer.classList.add('active');
    });
    
    // 1.5초 후 페이드 아웃 시작
    setTimeout(() => {
      cutInContainer.classList.add('fade-out');
    }, 1500);
    
    // 2초 후 완전히 제거 및 resolve
    setTimeout(() => {
      cutInContainer.remove();
      resolve();
    }, 2000);
  });
}

