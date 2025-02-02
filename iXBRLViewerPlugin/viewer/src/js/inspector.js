// Copyright 2019 Workiva Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import $ from 'jquery'
import { formatNumber, wrapLabel, truncateLabel } from "./util.js";
import { ReportSearch } from "./search.js";
import { Calculation } from "./calculations.js";
import { IXBRLChart } from './chart.js';
import { ViewerOptions } from './viewerOptions.js';
import { Identifiers } from './identifiers.js';
import { Menu } from './menu.js';
import { Accordian } from './accordian.js';
import { FactSet } from './factset.js';
import { Fact } from './fact.js';
import { Footnote } from './footnote.js';

const SEARCH_PAGE_SIZE = 100

export function Inspector(iv) {
    /* Insert HTML and CSS styles into body */
    $(require('../html/inspector.html')).prependTo('body');
    var inspector_css = require('css-loader!less-loader!../less/inspector.less').toString(); 
    $('<style id="ixv-style"></style>')
        .prop("type", "text/css")
        .text(inspector_css)
        .appendTo('head');
    $('<link id="ixv-favicon" type="image/x-icon" rel="shortcut icon" />')
        .attr('href', require('../img/favicon.ico'))
        .appendTo('head');
    this._iv = iv;
    this._chart = new IXBRLChart();
    this._viewerOptions = new ViewerOptions()
    
    $(".collapsible-header").click(function () { 
        var d = $(this).closest(".collapsible-section");
        d.toggleClass("collapsed"); 
        if (d.hasClass("collapsed")) {
            d.find(".collapsible-body").slideUp(250);
        }
        else {
            d.find(".collapsible-body").slideDown(250);
        }
    });
    $("#inspector .controls .search-button").click(function () {
        $(this).closest("#inspector").toggleClass("search-mode");
    });
    $("#inspector-head .back").click(function () {
        $(this).closest("#inspector").removeClass("search-mode");
    });
    $(".popup-trigger").hover(function () { $(this).find(".popup-content").show() }, function () { $(this).find(".popup-content").hide() });
    this._toolbarMenu = new Menu($("#toolbar-highlight-menu"));
    this.buildToolbarHighlightMenu();

    this._optionsMenu = new Menu($("#display-options-menu"));
    this.buildDisplayOptionsMenu();

    var inspector = this;
    // Listen to messages posted to this window
    $(window).on("message", function(e) { inspector.handleMessage(e) });
}

Inspector.prototype.initialize = function (report) {
    var inspector = this;
    return new Promise(function (resolve, reject) {
        inspector._report = report;
        report.setViewerOptions(inspector._viewerOptions);
        inspector._iv.setProgress("Building search index").then(() => {
            inspector._search = new ReportSearch(report);
            inspector.setupSearchControls();
            inspector.buildDisplayOptionsMenu();
            inspector.buildToolbarHighlightMenu();
            inspector.buildHighlightKey();
            resolve();
        });
    });
}

Inspector.prototype.setViewer = function (viewer) {
    this._viewer = viewer;
    viewer.onSelect.add((id, eltSet) => this.selectItem(id, eltSet));
    viewer.onMouseEnter.add((id) => this.viewerMouseEnter(id));
    viewer.onMouseLeave.add(id => this.viewerMouseLeave(id));
    $('.ixbrl-next-tag').click(() => viewer.selectNextTag());
    $('.ixbrl-prev-tag').click(() => viewer.selectPrevTag());
    this.search();
}


/*
 * Check for fragment identifier pointing to a specific fact and select it if
 * present.
 */
Inspector.prototype.handleFactDeepLink = function () {
    if (location.hash.startsWith("#f-")) {
        this.selectItem(location.hash.slice(3));
    }
}

Inspector.prototype.handleMessage = function (event) {
    var jsonString = event.originalEvent.data;
    var data = JSON.parse(jsonString);

    if (data.task == 'SHOW_FACT') {
        this.selectItem(data.factId);
    }
    else {
        console.log("Not handling unsupported task message: " + jsonString);
    }
}

Inspector.prototype.updateURLFragment = function () {
    if (this._currentItem) {
        location.hash = "#f-" + this._currentItem.id;
    }
    else {
        location.hash = "";
    }
}

Inspector.prototype.buildDisplayOptionsMenu = function () {
    this._optionsMenu.reset();
    if (this._report) {
        var dl = this.selectDefaultLanguage();
        this._optionsMenu.addCheckboxGroup(this._report.availableLanguages(), this._report.languageNames(), dl, (lang) => { this.setLanguage(lang); this.update() }, "select-language");
        this.setLanguage(dl);
    }
    this._iv.callPluginMethod("extendDisplayOptionsMenu", this._optionsMenu);
}

Inspector.prototype.buildToolbarHighlightMenu = function () {
    this._toolbarMenu.reset();
    this._toolbarMenu.addCheckboxItem("XBRL Elements", (checked) => this.highlightAllTags(checked), "highlight-tags");
    this._iv.callPluginMethod("extendToolbarHighlightMenu", this._toolbarMenu);
}

Inspector.prototype.buildHighlightKey = function () {
    $(".highlight-key .items").empty();
    var key = this._report.namespaceGroups();
    this._iv.callPluginMethod("extendHighlightKey", key);

    for (var i = 0; i < key.length; i++) {
        $("<div>")
            .addClass("item")
            .append($("<span></span>").addClass("sample").addClass("sample-" + i))
            .append($("<span></span>").text(key[i]))
            .appendTo($(".highlight-key .items"));
    }
}

Inspector.prototype.highlightAllTags = function (checked) {
    var inspector = this;
    this._viewer.highlightAllTags(checked, inspector._report.namespaceGroups());
}

Inspector.prototype.factListRow = function(f) {
    var row = $('<div class="fact-list-item"></div>')
        .click(() => this.selectItem(f.id))
        .dblclick(() => $('#inspector').removeClass("search-mode"))
        .mousedown(function (e) { 
            /* Prevents text selection via double click without
             * disabling click+drag text selection (which user-select:
             * none would )
             */
            if (e.detail > 1) { 
                e.preventDefault() 
            } 
        })
        .mouseenter(() => this._viewer.linkedHighlightFact(f))
        .mouseleave(() => this._viewer.clearLinkedHighlightFact(f))
        .data('ivid', f.id);
    $('<div class="select-icon"></div>')
        .click(() => {
            this.selectItem(f.id);
            $('#inspector').removeClass("search-mode");
        })
        .appendTo(row)
    $('<div class="title"></div>')
        .text(f.getLabel("std") || f.conceptName())
        .appendTo(row);
    $('<div class="dimension"></div>')
        .text(f.period().toString())
        .appendTo(row);

    for (const aspect of f.aspects()) {
        if (aspect.isTaxonomyDefined() && !aspect.isNil()) {
            $('<div class="dimension"></div>')
                .text(aspect.valueLabel())
                .appendTo(row);
        }
    }
    if (f.isHidden()) {
        $('<div class="hidden">Hidden fact</div>')
            .appendTo(row);
    }
    return row;
}

Inspector.prototype.addResults = function(container, results, offset) {
    $('.more-results', container).remove();
    for (var i = offset; i < results.length; i++ ) {
        if (i - offset >= SEARCH_PAGE_SIZE) {
            $('<div class="more-results"></div>')
                .text("Show more results")
                .click(() => this.addResults(container, results, i))
                .appendTo(container);
            break;
        }
        this.factListRow(results[i].fact).appendTo(container);
    }
}

Inspector.prototype.searchSpec = function () {
    var spec = {};
    spec.searchString = $('#ixbrl-search').val();
    spec.showVisibleFacts = $('#search-visible-fact-filter').prop('checked');
    spec.showHiddenFacts = $('#search-hidden-fact-filter').prop('checked');
    spec.periodFilter = $('#search-filter-period').val();
    spec.conceptTypeFilter = $('#search-filter-concept-type').val();
    return spec;
}

Inspector.prototype.setupSearchControls = function (viewer) {
    var inspector = this;
    $('.search-controls input, .search-controls select').change(() => this.search());
    $(".search-controls div.filter-toggle").click(() => $(".search-controls").toggleClass('show-filters'));
    $(".search-controls .search-filters .reset").click(() => this.resetSearchFilters());
    $("#search-filter-period")
        .empty()
        .append($('<option value="*">ALL</option>'));
    for (const key in this._search.periods) {
        $("<option>")
            .attr("value", key)
            .text(this._search.periods[key])
            .appendTo('#search-filter-period');
    }
}

Inspector.prototype.resetSearchFilters = function () {
    $("#search-filter-period").val("*");
    $("#search-filter-concept-type").val("*");
    $("#search-hidden-fact-filter").prop("checked", true);
    $("#search-visible-fact-filter").prop("checked", true);
    this.search();
}

Inspector.prototype.search = function() {
    var spec = this.searchSpec();
    var results = this._search.search(spec);
    var viewer = this._viewer;
    var container = $('#inspector .search-results .results');
    $('div', container).remove();
    viewer.clearRelatedHighlighting();
    var overlay = $('#inspector .search-results .search-overlay');
    if (results.length > 0) {
        overlay.hide();
        this.addResults(container, results, 0);
    }
    else {
        $(".title", overlay).text("No Match Found");
        $(".text", overlay).text("Try again with different keywords");
        overlay.show();
    }
    /* Don't highlight search results if there's no search string */
    if (spec.searchString != "") {
        viewer.highlightRelatedFacts($.map(results, r =>  r.fact ));
    }
}

Inspector.prototype.updateCalculation = function (fact, elr) {
    $('.calculations .tree').empty().append(this._calculationHTML(fact, elr));
}

Inspector.prototype.updateFootnotes = function (fact) {
    $('.footnotes').empty().append(this._footnotesHTML(fact));
}


Inspector.prototype._anchorList = function (fact, anchors) {
    var html = $("<ul></ul>");
    if (anchors.length > 0) {
        for (const c of anchors) {
            const otherFacts = this._report.getAlignedFacts(fact, { "c": c });
            const label = this._report.getLabel(c, "std", true);

            $("<li></li>")
                .appendTo(html)
                .append(this.factLinkHTML(label, otherFacts));
        }
    }
    else {
        $("<li><i>None</i></li>").appendTo(html);
    }
    return html;
}

Inspector.prototype.updateAnchoring = function (fact) {
    if (!this._report.usesAnchoring()) {
        $('.anchoring').hide();
    }
    else {
        $('.anchoring').show();

        $('.anchoring .collapsible-body .anchors-wider')
            .empty()
            .append(this._anchorList(fact, fact.widerConcepts()));

        $('.anchoring .collapsible-body .anchors-narrower')
            .empty()
            .append(this._anchorList(fact, fact.narrowerConcepts()));
    }

}

Inspector.prototype._referencesHTML = function (fact) {
    var c = fact.concept();
    var a = new Accordian();
    $.each(fact.concept().references(), function (i,r) {
        var title = $("<span></span>").text(r[0].value);
        var body =  $('<table class="fact-properties"><tbody></tbody></table>')
        var tbody = body.find("tbody");
        $.each(r, function (j,p) {
            var row = $("<tr>")
                .append($("<th></th>").text(p.part))
                .append($("<td></td>").text(p.value))
                .appendTo(tbody);
            if (p.part == 'URI') {
                row.addClass("uri");
                row.find("td").wrapInner($("<a>").attr("href",p.value));
            }
        });
        a.addCard(title, body, i == 0);
    });
    return a.contents();
}

Inspector.prototype._calculationHTML = function (fact, elr) {
    var calc = new Calculation(fact);
    if (!calc.hasCalculations()) {
        return "";
    }
    var tableFacts = this._viewer.factsInSameTable(fact);
    if (!elr) {
        elr = calc.bestELRForFactSet(tableFacts);
    }
    var report = this._report;
    var viewer = this._viewer;
    var inspector = this;
    var a = new Accordian();

    $.each(calc.elrs(), function (e, rolePrefix) {
        var label = report.getRoleLabel(rolePrefix, inspector._viewerOptions);

        var rCalc = calc.resolvedCalculation(e);
        var calcBody = $('<div></div>');
        $.each(rCalc, function (i, r) {
            var itemHTML = $("<div></div>")
                .addClass("item")
                .append($("<span></span>").addClass("weight").text(r.weightSign + " "))
                .append($("<span></span>").addClass("concept-name").text(report.getLabel(r.concept, "std")))
                .appendTo(calcBody);

            if (r.facts) {
                itemHTML.addClass("calc-fact-link");
                itemHTML.data('ivid', r.facts);
                itemHTML.click(function () { inspector.selectItem(Object.values(r.facts)[0].id ) });
                itemHTML.mouseenter(function () { $.each(r.facts, function (k,f) { viewer.linkedHighlightFact(f); })});
                itemHTML.mouseleave(function () { $.each(r.facts, function (k,f) { viewer.clearLinkedHighlightFact(f); })});
                $.each(r.facts, function (k,f) { viewer.highlightRelatedFact(f); });
            }
        });
        $("<div></div>").addClass("item").addClass("total")
            .append($("<span></span>").addClass("weight"))
            .append($("<span></span>").addClass("concept-name").text(fact.getLabel("std")))
            .appendTo(calcBody);

        a.addCard($("<span></span>").text(label), calcBody, e == elr);

    });
    return a.contents();
}

Inspector.prototype._footnotesHTML = function (fact) {
    var html = $("<div></div>");
    $.each(fact.footnotes(), (n, fn) => {
        $("<div></div>")
            .addClass("block-list-item")
            .appendTo(html)
            .text(truncateLabel(fn.textContent(), 120))
            .mouseenter(() => this._viewer.linkedHighlightFact(fn))
            .mouseleave(() => this._viewer.clearLinkedHighlightFact(fn))
            .click(() => this.selectItem(fn.id));
    });
    return html;
}

Inspector.prototype.viewerMouseEnter = function (id) {
    $('.calculations .item').filter(function () {   
        return $.inArray(id, $.map($(this).data('ivid'), function (f)  { return f.id })) > -1 
    }).addClass('linked-highlight');
    $('#inspector .search .results tr').filter(function () {   
        return $(this).data('ivid') == id;
    }).addClass('linked-highlight');
}

Inspector.prototype.viewerMouseLeave = function (id) {
    $('.calculations .item').removeClass('linked-highlight');
    $('#inspector .search .results tr').removeClass('linked-highlight');
}

Inspector.prototype.describeChange = function (oldFact, newFact) {
    if (newFact.value() > 0 == oldFact.value() > 0 && Math.abs(oldFact.value()) + Math.abs(newFact.value()) > 0) {
        var x = (newFact.value() - oldFact.value()) * 100 / oldFact.value();
        var t;
        if (x >= 0) {
            t = formatNumber(x,1) + "% increase on ";
        }
        else {
            t = formatNumber(-1 * x,1) + "% decrease on ";
        }
        return t;
    }
    else {
        return "From " + oldFact.readableValue() + " in "; 
    }

}

Inspector.prototype.factLinkHTML = function (label, factList) {
    var html = $("<span></span>").text(label);
    if (factList.length > 0) {
        html
        .addClass("fact-link")
        .click(() => this.selectItem(factList[0].id))
        .mouseenter(() => $.each(factList, (i,f) => this._viewer.linkedHighlightFact(f)))
        .mouseleave(() => $.each(factList, (i,f) => this._viewer.clearLinkedHighlightFact(f)));
    }
    return html;
}

Inspector.prototype.getPeriodIncrease = function (fact) {
    var viewer = this._viewer;
    var inspector = this;
    if (fact.isNumeric()) {
        var otherFacts = this._report.getAlignedFacts(fact, {"p":null });
        var mostRecent;
        if (fact.periodTo()) {
            $.each(otherFacts, function (i, of) {
                if (of.periodTo() && of.periodTo() < fact.periodTo() && (!mostRecent || of.periodTo() > mostRecent.periodTo()) && fact.isEquivalentDuration(of)) {
                    mostRecent = of;
                }
            });
        }
        var s = "";
        if (mostRecent) {
            var allMostRecent = this._report.getAlignedFacts(mostRecent);
            s = $("<span></span>")
                    .text(this.describeChange(mostRecent, fact))
                    .append(this.factLinkHTML(mostRecent.periodString(), allMostRecent));

        }
        else {
            s = $("<i>").text("No prior fact in this report");
        }
    }
    else {
        s = $("<i>").text("n/a").attr("title", "non-numeric fact");
    }
    $(".fact-properties tr.change td").html(s);

}

Inspector.prototype._updateValue = function (item, showAll, context) {
    const text = item.readableValue();
    var v = text;
    if (!showAll) {
        var fullLabel = text;
        var vv = wrapLabel(text, 120);
        if (vv.length > 1) {
            $('tr.value', context).addClass("truncated");
            $('tr.value .show-all', context).off().click(() => this._updateValue(text, true, context));
        }
        else {
            $('tr.value', context).removeClass('truncated');
        }
        v = vv[0];
    }
    else {
        $('tr.value', context).removeClass('truncated');
    }

    var valueSpan = $('tr.value td .value', context).empty().text(v);
    if (item instanceof Fact && item.isNil()) {
        valueSpan.wrapInner("<i></i>");
    }

}

Inspector.prototype._updateEntityIdentifier = function (fact, context) {
    var url = Identifiers.identifierURLForFact(fact);
    var cell = $('tr.entity-identifier td', context);
    cell.empty();
    if (url) {
        $('<span></span>').text('['+Identifiers.identifierNameForFact(fact) + "] ").appendTo(cell)
        $('<a target="_blank"></a>').attr('href',url).text(fact.identifier().localname).appendTo(cell)
    }
    else {
        cell.text(fact.f.a.e);
    }
}

Inspector.prototype._footnoteFactsHTML = function() {
    var html = $('<div></div>');
    this._currentItem.facts.forEach((fact) =>  {
        html.append(this.factListRow(fact));
    });
    return html;
}

/* 
 * Build an accordian containing a summary of all nested facts/footnotes
 * corresponding to the current viewer selection.
 */
Inspector.prototype._selectionSummaryAccordian = function() {
    var cf = this._currentItem;

    // dissolveSingle => title not shown if only one item in accordian
    var a = new Accordian({
        onSelect: (id) => this.switchItem(id),
        alwaysOpen: true,
        dissolveSingle: true,
    });

    var fs = new FactSet(this._currentItemList);
    $.each(this._currentItemList, (i, fact) => {
        var factHTML;
        var title = fs.minimallyUniqueLabel(fact);
        if (fact instanceof Fact) {
            factHTML = $(require('../html/fact-details.html')); 
            $('.std-label', factHTML).text(fact.getLabel("std", true) || fact.conceptName());
            $('.documentation', factHTML).text(fact.getLabel("doc") || "");
            $('tr.concept td', factHTML).text(fact.conceptName());
            $('tr.period td', factHTML)
                .text(fact.periodString());
            if (fact.isNumeric()) {
                $('tr.period td', factHTML).append(
                    $("<span></span>") 
                        .addClass("analyse")
                        .text("")
                        .click(() => this._chart.analyseDimension(fact,["p"]))
                );
            }
            this._updateEntityIdentifier(fact, factHTML);
            this._updateValue(fact, false, factHTML);

            var accuracyTD = $('tr.accuracy td', factHTML).empty().append(fact.readableAccuracy());
            if (!fact.isNumeric() || fact.isNil()) {
                accuracyTD.wrapInner("<i></i>");
            }

            $('#dimensions', factHTML).empty();
            for (const aspect of fact.aspects()) {
                if (!aspect.isTaxonomyDefined()) {
                    continue;
                }
                var h = $('<div class="dimension"></div>')
                    .text(aspect.label() || aspect.name())
                    .appendTo($('#dimensions', factHTML));
                if (fact.isNumeric()) {
                    h.append(
                        $("<span></span>") 
                            .addClass("analyse")
                            .text("")
                            .click(() => this._chart.analyseDimension(fact,[a]))
                    )
                }
                var s = $('<div class="dimension-value"></div>')
                    .text(aspect.valueLabel())
                    .appendTo(h);
                if (aspect.isNil()) {
                    s.wrapInner("<i></i>");
                }
            }
        }
        else if (fact instanceof Footnote) {
            factHTML = $(require('../html/footnote-details.html')); 
            this._updateValue(fact, false, factHTML);
        }
        a.addCard(
            title,
            factHTML, 
            fact.id == cf.id,
            fact.id
        );
    });
    return a;
}

Inspector.prototype.update = function () {
    var inspector = this;
    var cf = inspector._currentItem;
    if (!cf) {
        $('#inspector').removeClass('footnote-mode');
        $('#inspector').addClass('no-fact-selected');
    } 
    else { 
        $('#inspector').removeClass('no-fact-selected').removeClass("hidden-fact");

        $('#inspector .fact-inspector')
            .empty()
            .append(this._selectionSummaryAccordian().contents());

        if (cf instanceof Fact) {
            $('#inspector').removeClass('footnote-mode');

            this.updateCalculation(cf);
            this.updateFootnotes(cf);
            this.updateAnchoring(cf);
            $('div.references').empty().append(this._referencesHTML(cf));
            $('#inspector .search-results .fact-list-item').removeClass('selected');
            $('#inspector .search-results .fact-list-item').filter(function () { return $(this).data('ivid') == cf.id }).addClass('selected');

            var duplicates = cf.duplicates();
            var n = 0;
            var ndup = duplicates.length;
            for (var i = 0; i < ndup; i++) {
                if (cf.id == duplicates[i].id) {
                    n = i;
                }
            }
            $('.duplicates .text').text((n + 1) + " of " + ndup);
            var viewer = this._viewer;
            $('.duplicates .prev').off().click(() => inspector.selectItem(duplicates[(n+ndup-1) % ndup].id));
            $('.duplicates .next').off().click(() => inspector.selectItem(duplicates[(n+1) % ndup].id));

            this.getPeriodIncrease(cf);
            if (cf.isHidden()) {
                $('#inspector').addClass('hidden-fact');
            }
        }
        else if (cf instanceof Footnote) {
            $('#inspector').addClass('footnote-mode');
            $('#inspector .footnote-details .footnote-facts').empty().append(this._footnoteFactsHTML());
        }
    }
    this.updateURLFragment();
}

/*
 * Select a fact or footnote from the report.
 *
 * Takes an ID of the item to select.  An optional list of "alternate"
 * fact/footnotes may be specified, which will be presented in an accordian.
 * This is used when the user clicks on a nested fact/footnote in the viewer,
 * so that all items corresponding to the area clicked are shown.
 *
 * If itemIdList is omitted, the currently selected item list is reset to just
 * the primary item.
 */
Inspector.prototype.selectItem = function (id, itemIdList) {
    if (itemIdList === undefined) {
        this._currentItemList = [ this._report.getItemById(id) ];
    }
    else {
        this._currentItemList = [];
        for (var i = 0; i < itemIdList.length; i++) {
            this._currentItemList.push(this._report.getItemById(itemIdList[i]));
        }
    }
    this.switchItem(id);
}

/*
 * Switches the currently selected item.  Unlike selectItem, this does not
 * change the current list of "alternate" items.  
 *
 * For facts, the "id" must be in the current alternate fact list.
 *
 * For footnotes, we currently only support a single footnote being selected.
 */
Inspector.prototype.switchItem = function (id) {
    if (id !== null) {
        this._currentItem = this._report.getItemById(id);
        this._viewer.showItemById(id);
        this._viewer.highlightItem(id);
    }
    else {
        this._currentItem = null;
        this._viewer.clearHighlighting();
    }
    this.update();
}

Inspector.prototype.selectDefaultLanguage = function () {
    var preferredLanguages = window.navigator.languages || [ window.navigator.language || window.navigator.userLanguage ] ;
    var al = this._report.availableLanguages();
    $.each(preferredLanguages, function (i, pl) {
        $.each(al, function (j, l) {
            if (l.toLowerCase() == pl.toLowerCase()) {
                return l;
            }
        });
    });
    return this._report.availableLanguages()[0];
}

Inspector.prototype.setLanguage = function (lang) {
    this._viewerOptions.language = lang;
}
