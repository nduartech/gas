import { template as _$template, insert as _$insert, memo as _$memo } from "solid-js/web";
const _tmpl$ = /*#__PURE__*/_$template(`<div><!>`);
const _tmpl$2 = /*#__PURE__*/_$template(`<span>Visible`);
/** @jsxImportSource solid-js */
const view = (() => {
  const _el$0 = _tmpl$();
  _$insert(_el$0.firstChild.parentNode, (() => { var _c$ = _$memo(() => !!show()); return () => _c$() && _tmpl$2(); })(), _el$0.firstChild);
  return _el$0;
})();
