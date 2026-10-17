(() => {
'use strict';

    const hanger = document.getElementById('swingingHanger');
    const shadow = document.getElementById('dynamicShadow');
    const trigger = document.getElementById('vpn-hanger-trigger');

    // Естественный угол покоя карточки
    const restAngle = -4.5;

    // Параметры физического маятника
    let currentAngle = 36;    // Начальный угол (как только повесили)
    let velocity = 0;         // Угловая скорость
    const gravity = 0.011;    // Сила тяжести
    const damping = 0.968;    // Затухание
    let animFrameId = null;

    function updatePendulum() {
      const diff = currentAngle - restAngle;
      const acceleration = -gravity * diff;
      velocity = (velocity + acceleration) * damping;
      currentAngle += velocity;

      const slideX = (currentAngle - restAngle) * 0.06;
      hanger.style.transform = `translateX(${slideX.toFixed(2)}px) rotate(${currentAngle.toFixed(2)}deg)`;

      if (shadow) {
        const shadowOffsetX = -(currentAngle - restAngle) * 0.35;
        shadow.setAttribute('dx', shadowOffsetX.toFixed(1));
      }

      if (Math.abs(velocity) > 0.01 || Math.abs(diff) > 0.05) {
        animFrameId = requestAnimationFrame(updatePendulum);
      } else {
        hanger.style.transform = `rotate(${restAngle}deg)`;
        startIdleBreathing();
      }
    }

    let idleTime = 0;
    function startIdleBreathing() {
      function breathe() {
        idleTime += 0.025;
        const sway = restAngle + Math.sin(idleTime) * 0.85;
        hanger.style.transform = `rotate(${sway.toFixed(2)}deg)`;
        animFrameId = requestAnimationFrame(breathe);
      }
      animFrameId = requestAnimationFrame(breathe);
    }

    function pushHanger(initialAngle = 28, initialVelocity = -1.2) {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      currentAngle = initialAngle;
      velocity = initialVelocity;
      animFrameId = requestAnimationFrame(updatePendulum);
    }

    trigger.addEventListener('click', () => {
      const dir = velocity >= 0 ? -1 : 1;
      pushHanger(currentAngle, dir * 2.4);
    });

    const sheet = document.getElementById('vpn-sheet');
    new MutationObserver(() => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = null;
      if (sheet.open && !document.hidden) pushHanger(35, -0.5);
    }).observe(sheet, {attributes:true, attributeFilter:['open']});
    document.addEventListener('visibilitychange', () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = null;
      if (sheet.open && !document.hidden) pushHanger(15, -0.5);
    });
})();
