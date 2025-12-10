import { template as _$template, delegateEvents as _$delegateEvents } from "solid-js/web";
const _tmpl$ = /*#__PURE__*/_$template(`<button>Click me</button>`);
/** @jsxImportSource solid-js */
const view = (() => {
  const _el$0 = _tmpl$();
  _el$0.$$click = handleClick;
  return _el$0;
})();

_$delegateEvents(["click"]);
