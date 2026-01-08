import { template as _$template, getNextElement as _$getNextElement, getNextMarker as _$getNextMarker, insert as _$insert } from "solid-js/web";
const _tmpl$ = /*#__PURE__*/_$template(`<span>Hello <!\$><!/>`);
/** @jsxImportSource solid-js */
const view = (() => {
  const _el$0 = _$getNextElement(_tmpl$);
  const _el$1 = _el$0.firstChild;
  const _el$2 = _el$1.nextSibling;
  const [_el$3, _co$4] = _$getNextMarker(_el$2.nextSibling);
  _$insert(_el$0, name, _el$3, _co$4);
  return _el$0;
})();
