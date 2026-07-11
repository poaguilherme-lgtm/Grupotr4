(function () {
  'use strict';

  var MOTION = { loops: 2, nodeActiveR: 14, nodeHaloR: 28, nodeHaloOpacity: 0.16, inactiveOpacity: 0.35 };
  var CX = 220, CY = 220, R = 140, LABEL_R = 186;

  function polar(deg, radius) {
    var rad = (deg * Math.PI) / 180;
    return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) };
  }

  var MOTORS = [
    { key: 'marketing', short: 'Marketing', angle: 0 },
    { key: 'operacao', short: 'Operação', angle: 120 },
    { key: 'administrativo', short: 'Administrativo', angle: 240 }
  ];

  var motorsSection = document.getElementById('motorsSection');
  var motorsPin = document.getElementById('motorsPin');
  var progressArc = document.getElementById('progressArc');
  var progressDot = document.getElementById('progressDot');
  var haloGroup = document.getElementById('motorHalos');
  var nodeGroup = document.getElementById('motorNodes');
  var labelGroup = document.getElementById('motorLabels');
  var motorRows = document.querySelectorAll('.s2__row');

  var companiesSection = document.getElementById('companiesSection');
  var companiesPin = document.getElementById('companiesPin');
  var companiesStrip = document.getElementById('companiesStrip');

  var svgNS = 'http://www.w3.org/2000/svg';
  var haloEls = [], nodeEls = [], labelEls = [];

  MOTORS.forEach(function (m) {
    var pos = polar(m.angle, R);
    var labelPos = polar(m.angle, LABEL_R);

    var halo = document.createElementNS(svgNS, 'circle');
    halo.setAttribute('cx', pos.x.toFixed(2));
    halo.setAttribute('cy', pos.y.toFixed(2));
    halo.setAttribute('fill', '#6E7161');
    halo.style.transition = 'opacity 0.2s ease';
    haloGroup.appendChild(halo);
    haloEls.push(halo);

    var node = document.createElementNS(svgNS, 'circle');
    node.setAttribute('cx', pos.x.toFixed(2));
    node.setAttribute('cy', pos.y.toFixed(2));
    node.setAttribute('stroke-width', '1.5');
    node.style.transition = 'r 0.2s ease, fill 0.2s ease, opacity 0.2s ease';
    nodeGroup.appendChild(node);
    nodeEls.push(node);

    var label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', labelPos.x.toFixed(2));
    label.setAttribute('y', labelPos.y.toFixed(2));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('font-family', "'Archivo Black', sans-serif");
    label.style.textTransform = 'uppercase';
    label.style.transition = 'fill 0.2s ease, font-size 0.2s ease, opacity 0.2s ease';
    label.textContent = m.short;
    labelGroup.appendChild(label);
    labelEls.push(label);
  });

  function pinMode(rect, vh) {
    if (rect.top > 0) return 'before';
    if (rect.bottom <= vh) return 'after';
    return 'pinned';
  }

  function applyPinClass(el, mode) {
    el.classList.remove('is-before', 'is-pinned', 'is-after');
    el.classList.add('is-' + mode);
  }

  function updateMotors(angle) {
    var activeIndex = Math.floor((((angle + 60) % 360) / 120)) % 3;

    MOTORS.forEach(function (m, i) {
      var active = i === activeIndex;
      var halo = haloEls[i], node = nodeEls[i], label = labelEls[i];

      halo.setAttribute('r', active ? MOTION.nodeHaloR : 0);
      halo.setAttribute('opacity', active ? MOTION.nodeHaloOpacity : 0);

      node.setAttribute('r', active ? MOTION.nodeActiveR : 9);
      node.setAttribute('fill', active ? '#3E3E34' : '#EAE1D3');
      node.setAttribute('stroke', active ? '#3E3E34' : 'rgba(85,86,74,0.4)');
      node.setAttribute('opacity', active ? 1 : MOTION.inactiveOpacity);

      label.setAttribute('font-size', active ? 17 : 14);
      label.setAttribute('font-weight', active ? 700 : 500);
      label.setAttribute('fill', active ? '#2E2E27' : 'rgba(85,86,74,0.6)');
      label.setAttribute('opacity', active ? 1 : MOTION.inactiveOpacity);
    });

    var cycleToRowIndex = { 2: 0, 0: 1, 1: 2 };
    motorRows.forEach(function (row, idx) {
      var active = cycleToRowIndex[activeIndex] === idx;
      row.classList.toggle('is-active', active);
    });

    var arcPercent = (angle / 360 * 100).toFixed(2);
    progressArc.setAttribute('stroke-dasharray', arcPercent + ' 100');

    var dotPos = polar(angle, R);
    progressDot.setAttribute('cx', dotPos.x.toFixed(2));
    progressDot.setAttribute('cy', dotPos.y.toFixed(2));
  }

  function handleScroll() {
    var vh = window.innerHeight;

    if (motorsSection) {
      var rect = motorsSection.getBoundingClientRect();
      var mode = pinMode(rect, vh);
      applyPinClass(motorsPin, mode);

      var total = rect.height - vh;
      var progress = total > 0 ? (-rect.top) / total : 0;
      progress = Math.max(0, Math.min(1, progress));
      var angle = (progress * 360 * MOTION.loops) % 360;
      updateMotors(angle);
    }

    if (companiesSection && companiesStrip) {
      var cRect = companiesSection.getBoundingClientRect();
      var cMode = pinMode(cRect, vh);
      applyPinClass(companiesPin, cMode);

      var cTotal = cRect.height - vh;
      var completionFraction = 0.8;
      var cProgress = cTotal > 0 ? (-cRect.top) / (cTotal * completionFraction) : 0;
      cProgress = Math.max(0, Math.min(1, cProgress));
      var maxShift = Math.max(0, companiesStrip.scrollWidth - window.innerWidth + 48);
      var shift = cProgress * maxShift;
      companiesStrip.style.transform = 'translateX(-' + shift.toFixed(2) + 'px)';
    }
  }

  document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleScroll, { passive: true });
  window.addEventListener('load', handleScroll);
  handleScroll();

  // SECTION 4: BPM waitlist form
  var bpmForm = document.getElementById('bpmForm');
  var s4Fields = document.getElementById('s4Fields');
  var s4Success = document.getElementById('s4Success');

  bpmForm.addEventListener('submit', function (e) {
    e.preventDefault();
    s4Fields.hidden = true;
    s4Success.hidden = false;
  });
})();
