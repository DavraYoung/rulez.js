/* jshint latedef:nofunc */
/* jshint unused:false*/
/**
 *
 * @param config
 * @constructor
 */
(function (global, factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        // For CommonJS and CommonJS-like environments where a proper `window`
        // is present, execute the factory and get Rulez.
        // For environments that do not have a `window` with a `document`
        // (such as Node.js), expose a factory as module.exports.
        // This accentuates the need for the creation of a real `window`.
        // e.g. var Rulez = require('rulez.js')(window);
        module.exports = global.document ?
          factory(global, true) :
          function (w) {
              if (!w.document) {
                  throw new Error('rulez.js requires a window with a document');
              }
              return factory(w);
          };
    } else {
        factory(global);
    }
// Pass this if window is not defined yet
}(typeof window !== 'undefined' ? window : this, function (window, noGlobal) {
    var Rulez = function (config) {
        'use strict';
        var svgNS = 'http://www.w3.org/2000/svg';
        var defaultConfig = {
            width: null,
            height: null,
            element: null,
            layout: 'horizontal',
            alignment: 'top',
            units: '', //'em', 'ex', 'px', 'pt', 'pc', 'cm', 'mm', 'in' and ''(user units) :  http://www.w3.org/TR/SVG/coords.html#Units
            divisionDefaults: {
                strokeWidth: 1,
                type: 'rect',
                className: 'rulez-rect',
                renderer: null
            },
            textDefaults: {
                rotation: 0,
                offset: 25,
                className: 'rulez-text',
                /**
                 * Wherever to show or not to show units alongside text
                 */
                showUnits: false,
                centerText: true,
                renderer: null
            },
            divisions: [
                {
                    pixelGap: 5,
                    lineLength: 5
                },
                {
                    pixelGap: 25,
                    lineLength: 10
                },
                {
                    pixelGap: 50,
                    lineLength: 15
                },
                {
                    pixelGap: 100,
                    lineLength: 20
                }
            ],
            texts: [
                {
                    pixelGap: 100
                }
            ]
        };
        /**
         * result config
         */
        var c = mergeConfigs(JSON.parse(JSON.stringify(defaultConfig)), config);
        /**
         * amount of additional(redundant) divisions on left and right (top, bottom) side of ruler
         */
        var additionalDivisionsAmount = 2;
        /**
         * main group (g svg element) that contains all divisions and texts
         * @type {SVGGElement}
         */
        var g = createGroup();
        /**
         * Array of arrays of all texts
         * @type {Array.<Array.<SVGTextElement >>}
         */
        var texts = [];
        /**
         * Current position of ruler
         * @type {number}
         */
        var currentPosition = 0;
        /**
         * Start position of drawing ruler
         * @type {number}
         */
        var startPosition;
        /**
         * End position of drawing ruler
         * @type {number}
         */
        var endPosition;
        /**
         * Scale of ruler
         * @type {number}
         */
        var scale = 1;

        var size;
        var maxDistance = 0;
        var unitConversionRate;

        /**
         * Renders ruler inside svg element
         */
        this.render = function () {
            c.width || (c.width = c.element.getBoundingClientRect().width);
            c.height || (c.height = c.element.getBoundingClientRect().height);
            c.element.appendChild(g = createGroup());
            size = isVertical() ? c.height : c.width;
            unitConversionRate = getUnitConversionRate();
            calculateStartEndPosition(c);
            generateDivisionsAndTexts(startPosition, endPosition);
            this.scrollTo(0, false);
        };

        /**
         * Scrolls ruler to specified position.
         * @param {number} pos left(or top for vertical rulers) position to scroll to.
         * @param {boolean} useUnits if true pos will be multiplied by unit conversion rate;
         */
        this.scrollTo = function (pos, useUnits) {
            currentPosition = pos;
            if (useUnits) {
                currentPosition *= unitConversionRate;
            }

            if (isVertical()) {
                g.setAttribute('transform', 'translate(0,' + (-currentPosition % (maxDistance * unitConversionRate)) + ')');
            } else {
                g.setAttribute('transform', 'translate(' + (-currentPosition % (maxDistance * unitConversionRate)) + ',0)');
            }
            var pixelCurrentPosition = currentPosition / unitConversionRate;
            for (var i = 0; i < c.texts.length; i++) {
                var textConfig = c.texts[i];
                var textElements = texts[i];
                var amountPerMaxDistance = maxDistance / textConfig.pixelGap;
                var offset = pixelCurrentPosition % maxDistance;
                var startTextPos = pixelCurrentPosition - offset;
                for (var j = 0; j < textElements.length; j++) {
                    var textElement = textElements[j];
                    var text = (startTextPos + (j - additionalDivisionsAmount * amountPerMaxDistance) * textConfig.pixelGap) * scale;
                    if (textConfig.showUnits) {
                        text = addUnits(text);
                    }
                    textElement.textContent = text;
                    if (textConfig.renderer) {
                        textConfig.renderer(textElement);
                    }
                }
            }
        };

        /**
         * Scales the ruler's text values by specific value.
         * @param {number} scaleValue
         */
        this.setScale = function (scaleValue) {
            scale = scaleValue;
            this.scrollTo(currentPosition, false);
        };

        /**
         * Updates size with current clientWidth(height) in case it's bigger than previous one.
         * Only appends more divisions and texts if necessary.
         */
        this.resize = function () {
            var oldSize = size;
            var newSize = isVertical() ? c.element.clientHeight : c.element.clientWidth;
            if (oldSize !== newSize) {
                if (oldSize > newSize) {
                    //todo remove redundant divisions?
                } else {
                    size = newSize;
                    var oldEndPosition = endPosition;
                    calculateStartEndPosition();
                    generateDivisionsAndTexts(oldEndPosition, endPosition);
                    this.scrollTo(currentPosition, false);
                }
            }
        };

        /**
         * Callback that is called after saving of ruler as image is done
         * @callback saveFinishCallback
         * @param {string} base64 png image string
         */
        /**
         * Saves ruler as image.
         * @param {saveFinishCallback} saveFinishCallback
         */
        this.saveAsImage = function (saveFinishCallback) {
            var svgClone = deepCloneWithCopyingStyle(c.element);
            //http://stackoverflow.com/questions/23514921/problems-calling-drawimage-with-svg-on-a-canvas-context-object-in-firefox
            svgClone.setAttribute('width', c.width);
            svgClone.setAttribute('height', c.height);
            //
            var canvas = window.document.createElement('canvas');
            canvas.setAttribute('width', c.width);
            canvas.setAttribute('height', c.height);
            var ctx = canvas.getContext('2d');

            var URL = window.URL || window.webkitURL;

            var img = new Image();
            img.style.position = 'absolute';
            img.style.top = '-100000px';
            img.style.left = '-100000px';
            img.style.zIndex = -100000;
            img.setAttribute('width', c.width);
            img.setAttribute('height', c.height);

            var svg = new Blob([svgClone.outerHTML], {type: 'image/svg+xml;charset=utf-8'});
            var url = URL.createObjectURL(svg);

            img.onload = function () {
                setTimeout(function () { //workaround for not working width and height.
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(url);
                    window.document.body.removeChild(img);
                    saveFinishCallback(canvas.toDataURL());
                }, 1000);
            };

            window.document.body.appendChild(img);
            img.src = url;
        };

        /**
         * @returns {number} how much pixels are in used unit.
         */
        this.getUnitConversionRate = function () {
            return getUnitConversionRate();
        };

        function deepCloneWithCopyingStyle(node) {
            var clone = node.cloneNode(false);
            var i;
            if (node instanceof Element) {
                var computedStyle = window.getComputedStyle(node);
                if (computedStyle) {
                    for (i = 0; i < computedStyle.length; i++) {
                        var property = computedStyle[i];
                        clone.style.setProperty(property, computedStyle.getPropertyValue(property), '');
                    }
                }
            }
            for (i = 0; i < node.childNodes.length; i++) {
                clone.appendChild(deepCloneWithCopyingStyle(node.childNodes[i]));
            }

            return clone;
        }

        function calculateStartEndPosition(config) {
            if (!maxDistance) {
                c.divisions.forEach(function (entry) {
                    if (entry.pixelGap > maxDistance) {
                        maxDistance = entry.pixelGap;
                    }
                });
            }
            if (config && config.endPosition!=null) {
                endPosition = config.endPosition;
            } else {
                endPosition = size - (size % maxDistance) + maxDistance * additionalDivisionsAmount;
            }

            if (config && config.startPosition!=null) {
                startPosition = config.startPosition;
            } else {
                startPosition = -maxDistance * additionalDivisionsAmount;
            }
        }

        function generateDivisionsAndTexts(startPosition, endPosition) {
            c.divisions.forEach(function (division) {
                generateDivisions(startPosition, endPosition, division);
            });
            var i = 0;
            c.texts.forEach(function (textConfig) {
                var textsArray = generateTexts(startPosition, endPosition, textConfig);
                if (texts[i]) {
                    texts[i] = texts[i].concat(textsArray);
                } else {
                    texts.push(textsArray);
                }
                i++;
            });
        }

        function generateDivisions(startPosition, endPosition, elementConfig) {
            for (var i = startPosition; i < endPosition; i += elementConfig.pixelGap) {
                var line = createLine(i, elementConfig);
                g.appendChild(line);
                if (elementConfig.renderer) {
                    elementConfig.renderer(line);
                }
            }
        }

        function generateTexts(startPosition, endPosition, elementConfig) {
            var texts = [];
            for (var i = startPosition; i < endPosition; i += elementConfig.pixelGap) {
                var text = createText(i, elementConfig);
                g.appendChild(text);
                if (elementConfig.renderer) {
                    elementConfig.renderer(text);
                }
                texts.push(text);
            }
            return texts;
        }

        function createLine(pos, elementConfig) {
            switch (elementConfig.type) {
                case 'line':
                    return _createLine(pos, elementConfig);
                case 'rect':
                    return _createRect(pos, elementConfig);
                default :
                    return _createRect(pos, elementConfig);
            }
        }

        function _createLine(pos, elementConfig) {
            var line = window.document.createElementNS(svgNS, 'line');
            var defaultAlignment = isDefaultAlignment();
            var x1, x2, y1, y2;
            if (isVertical()) {
                x1 = 'y1';
                x2 = 'y2';
                y1 = 'x1';
                y2 = 'x2';
            } else {
                x1 = 'x1';
                x2 = 'x2';
                y1 = 'y1';
                y2 = 'y2';
            }

            line.setAttribute('class', elementConfig.className);
            line.setAttribute(x1, addUnits(pos));
            line.setAttribute(x2, addUnits(pos));
            line.setAttribute(y1, addUnits(defaultAlignment ? '0' : getAlignmentOffset() - elementConfig.lineLength));
            line.setAttribute(y2, addUnits(defaultAlignment ? elementConfig.lineLength : getAlignmentOffset()));
            line.setAttribute('stroke-width', addUnits(elementConfig.strokeWidth));
            return line;
        }

        function _createRect(pos, elementConfig) {
            var line = window.document.createElementNS(svgNS, 'rect');
            var defaultAlignment = isDefaultAlignment();
            var x, y, height, width;
            if (isVertical()) {
                x = 'y';
                y = 'x';
                height = 'width';
                width = 'height';
            } else {
                x = 'x';
                y = 'y';
                height = 'height';
                width = 'width';
            }
            var oldUnit = g.querySelector('rect[x="' + addUnits(pos) + '"]');
            if(oldUnit) oldUnit.remove();
            line.setAttribute('class', elementConfig.className);
            line.setAttribute(x, addUnits(pos));
            line.setAttribute(y, addUnits(defaultAlignment ? '0' : getAlignmentOffset() - elementConfig.lineLength));
            line.setAttribute(height, addUnits(elementConfig.lineLength));
            line.setAttribute(width, addUnits(elementConfig.strokeWidth));
            return line;
        }

        function createText(pos, elementConfig) {
            var textSvg = window.document.createElementNS(svgNS, 'text');
            var yPos = getTextPosY(elementConfig);
            var x, y;
            textSvg.setAttribute('class', elementConfig.className);
            if (isVertical()) {
                x = 'y';
                y = 'x';
            } else {
                x = 'x';
                y = 'y';
            }
            var oldUnit = g.querySelector('text[x="' + addUnits(pos) + '"]');
            if (oldUnit) {
                oldUnit.remove();
            }
            textSvg.origPos = pos;
            textSvg.origPosAttribute = x;
            textSvg.setAttribute(x, addUnits(pos));
            textSvg.setAttribute(y, addUnits(yPos));
            rotateText(textSvg, elementConfig);
            textSvg.textContent = elementConfig.showUnits ? addUnits(pos) : pos;
            if (elementConfig.centerText) {
                textSvg.setAttribute('text-anchor', 'middle');
            }
            return textSvg;
        }

        function createGroup() {
            return window.document.createElementNS(svgNS, 'g');
        }

        function isVertical() {
            return c.layout === 'vertical';
        }

        function isDefaultAlignment() {
            return !(c.alignment === 'bottom' || c.alignment === 'right');
        }

        function getAlignmentOffset() {
            return isVertical() ? c.width : c.height;
        }

        function mergeConfigs(def, cus, notOverrideDef) {
            if (!cus) {
                return def;
            }

            for (var param in cus) {
                if (cus.hasOwnProperty(param)) {
                    switch (param) {
                        case 'divisionDefaults':
                        case 'textDefaults':
                            mergeConfigs(def[param], cus[param]);
                            break;
                        default :
                            if (!(notOverrideDef && def[param])) {
                                def[param] = cus[param];
                            }
                    }
                }
            }
            if (def.divisions) {
                def.divisions.forEach(function (entry) {
                    mergeConfigs(entry, def.divisionDefaults, entry);
                    if (!entry.className) {
                        entry.className = entry.type === 'line' ? 'rulez-line' : 'rulez-rect';
                    }
                });
            }
            if (def.texts) {
                def.texts.forEach(function (entry) {
                    mergeConfigs(entry, def.textDefaults, entry);
                });
            }

            return def;
        }

        function addUnits(value) {
            return value + c.units;
        }

        function getUnitConversionRate() {
            if (c.units === '' || c.units === 'px') {
                return 1;
            }
            var dummyEl = window.document.createElement('div');
            dummyEl.style.position = 'absolute';
            dummyEl.style.top = '-100000px';
            dummyEl.style.left = '-100000px';
            dummyEl.style.zIndex = -100000;
            dummyEl.style.width = dummyEl.style.height = addUnits(1);
            window.document.body.appendChild(dummyEl);
            var width = (window.getComputedStyle(dummyEl).width).replace('px', '');
            window.document.body.removeChild(dummyEl);
            return width;
        }

        function rotateText(textElement, elementConfig) {
            var rotate;
            var pos = textElement.origPos;
            var yPos = getTextPosY(elementConfig);
            if (isVertical()) {
                rotate = 'rotate(' + elementConfig.rotation + ' ' + (yPos * unitConversionRate) + ' ' + (pos * unitConversionRate) + ')';
            } else {
                rotate = 'rotate(' + elementConfig.rotation + ' ' + (pos * unitConversionRate) + ' ' + (yPos * unitConversionRate) + ')';
            }
            textElement.setAttribute('transform', rotate);
        }

        function getTextPosY(elementConfig) {
            var defaultAlignment = isDefaultAlignment();
            return defaultAlignment ? elementConfig.offset : getAlignmentOffset() - elementConfig.offset;
        }
    };
    if (!noGlobal) {
        window.Rulez = Rulez;
    }
    return Rulez;
}));


