const ARROW_PROFILE = 'click-v2-left';
const CONFIRM_PROFILE = 'click-v2';
const DIRECTIONS = {
  left: { horizontal: true, sign: -1 },
  right: { horizontal: true, sign: 1 },
  up: { horizontal: false, sign: -1 },
  down: { horizontal: false, sign: 1 },
};
const NAVIGABLE = 'button, a[href], summary, input[type="checkbox"]';

function menuDirection(profile, button) {
  return profile === ARROW_PROFILE && DIRECTIONS[button];
}

function confirmsSelection(profile, button) {
  return profile === CONFIRM_PROFILE && button === 'b';
}

export function shifterMenuActionLabel(profile, button) {
  if (confirmsSelection(profile, button)) return 'Confirm menu selection';
  if (menuDirection(profile, button)) return 'Move menu selection';
  return '';
}

function renderMenuKey(element, key) {
  const button = key?.button ?? '';
  if (element.dataset.shifterButton === button) return;
  element.dataset.shifterButton = button;
  if (Object.hasOwn(DIRECTIONS, button)) {
    const glyph = element.ownerDocument.getElementById('shifter-direction-glyph').content.cloneNode(true);
    glyph.firstElementChild.setAttribute('aria-label', key.label);
    element.replaceChildren(glyph);
  } else {
    element.textContent = key?.label ?? '';
  }
}

function visibleControl(element) {
  return element && !element.matches(':disabled, [aria-disabled="true"], [tabindex="-1"]') &&
    !element.closest('[hidden], [inert], .hidden') && element.getClientRects().length &&
    getComputedStyle(element).visibility === 'visible';
}

function findInDirection(origin, candidates, { horizontal, sign }) {
  const start = origin.getBoundingClientRect();
  const along = horizontal ? 'x' : 'y';
  const alongSize = horizontal ? 'width' : 'height';
  const cross = horizontal ? 'y' : 'x';
  const crossSize = horizontal ? 'height' : 'width';
  let best;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    const gap = sign * (rect[along] + rect[alongSize] / 2 - start[along] - start[alongSize] / 2);
    if (gap < 2) continue;
    const offset = Math.abs(rect[cross] + rect[crossSize] / 2 - start[cross] - start[crossSize] / 2);
    const crossGap = Math.max(0, offset - (rect[crossSize] + start[crossSize]) / 2);
    if (horizontal && crossGap > 0) continue;
    const distance = gap + 2 * crossGap + offset / 4;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export function mountShifterMenuNavigation(menu) {
  const tabs = menu.querySelector('.menu-nav-pills');
  const startRide = menu.querySelector('#btn-settings-close');
  const closeMenu = menu.querySelector('#btn-settings-close-top');
  const hints = menu.querySelector('#shifter-menu-hint');
  const navigateHint = hints.querySelector('#shifter-navigate-hint');
  const confirmHint = hints.querySelector('#shifter-confirm-hint');
  const closeHint = hints.querySelector('#shifter-close-hint');
  const closeKey = closeHint.querySelector('kbd');
  const startKey = startRide.querySelector('.shifter-start-key');
  const openKey = document.getElementById('shifter-open-menu-key');
  const inputRoot = document.documentElement;
  let lastInputWasShifter = false;
  let pointerX = null;
  let pointerY = null;

  function setShifterInput(active) {
    lastInputWasShifter = active;
    inputRoot.toggleAttribute('data-shifter-input', active && (!hints.hidden || !openKey.hidden));
  }

  function useStandardInput(event) {
    if (event.isTrusted && lastInputWasShifter) setShifterInput(false);
  }

  window.addEventListener('pointermove', event => {
    if (!event.isTrusted) return;
    const moved = pointerX === null ? event.movementX || event.movementY :
      event.clientX !== pointerX || event.clientY !== pointerY;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (moved) useStandardInput(event);
  }, { capture: true, passive: true });
  window.addEventListener('click', event => {
    if (event.detail > 0) useStandardInput(event);
  }, true);
  window.addEventListener('wheel', useStandardInput, { capture: true, passive: true });
  window.addEventListener('keydown', useStandardInput, true);

  function controls(container) {
    return [...(container?.querySelectorAll(NAVIGABLE) ?? [])].filter(visibleControl);
  }

  function focus(element) {
    if (!visibleControl(element)) return;
    if (!element.hasAttribute('data-shifter-focus')) {
      element.setAttribute('data-shifter-focus', '');
      element.addEventListener('blur', () => element.removeAttribute('data-shifter-focus'), { once: true });
    }
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function focusTab() {
    focus(tabs.querySelector('[aria-current="page"]') ?? controls(tabs)[0]);
  }

  function focusStart() {
    focus(startRide);
  }

  return {
    focusTab,
    focusStart,
    useShifter: () => setShifterInput(true),
    isUsingShifter: () => inputRoot.hasAttribute('data-shifter-input'),
    updateShortcuts({ profiles, keys, connectedManually }) {
      const canNavigate = profiles.has(ARROW_PROFILE);
      const canConfirm = profiles.has(CONFIRM_PROFILE);
      // W głównym menu strzałki lewej manetki i B prawej mają pierwszeństwo przed przypisaniem.
      const closeBinding = keys.find(({ profile, button }) => !menuDirection(profile, button) && !confirmsSelection(profile, button));
      navigateHint.toggleAttribute('hidden', !canNavigate);
      confirmHint.toggleAttribute('hidden', !canConfirm);
      startKey.toggleAttribute('hidden', !canConfirm);
      closeHint.toggleAttribute('hidden', !closeBinding);
      openKey.toggleAttribute('hidden', !keys.length);
      hints.toggleAttribute('hidden', !(canNavigate || canConfirm || closeBinding));
      menu.toggleAttribute('data-shifter-close-key', Boolean(closeBinding));
      renderMenuKey(closeKey, closeBinding);
      renderMenuKey(openKey, keys[0]);
      setShifterInput(connectedManually || lastInputWasShifter);
    },
    press(profile, button) {
      const confirms = confirmsSelection(profile, button);
      const direction = menuDirection(profile, button);
      if (!confirms && !direction) return false;

      const activeSection = menu.querySelector('.menu-section:not(.hidden)');
      const tabControls = controls(tabs);
      const sectionControls = controls(activeSection);
      const targets = [
        ...tabControls, ...controls(menu.querySelector('#ride-recovery-panel')), ...sectionControls,
        ...controls(menu.querySelector('.session-preflight')), ...controls(menu.querySelector('.menu-footer-actions')),
        ...(visibleControl(closeMenu) ? [closeMenu] : []),
      ];
      const current = document.activeElement;
      if (!targets.includes(current)) {
        focusTab();
      } else if (confirms) {
        focus(current);
        current.click();
        if (current.matches('.route-card[data-preset], .workout-preset-card') && current.getAttribute('aria-pressed') === 'true') {
          focusStart();
        }
      } else if (tabControls.includes(current) && direction.horizontal) {
        focus(tabControls[tabControls.indexOf(current) + direction.sign]);
      } else if (tabControls.includes(current) && button === 'down') {
        focus(sectionControls.find(element => element.getAttribute('aria-pressed') === 'true') ?? sectionControls[0] ?? startRide);
      } else {
        focus(findInDirection(current, targets.filter(element => element !== current), direction));
      }
      return true;
    },
  };
}
