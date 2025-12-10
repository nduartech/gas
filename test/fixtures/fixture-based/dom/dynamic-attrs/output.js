import { template as _$template, style as _$style, effect as _$effect } from "solid-js/web";
const _tmpl$ = /*#__PURE__*/_$template(`<div>Dynamic attributes</div>`);
/** @jsxImportSource solid-js */
const view = (() => {
  const _el$0 = _tmpl$();
  _$effect(() => _el$0.className = getClass());
  _$effect(() => _$style(_el$0, getStyle()));
  return _el$0;
})();
