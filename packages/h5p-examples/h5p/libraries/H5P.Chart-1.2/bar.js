/*global d3*/
H5P.Chart.BarChart = (function () {

  /**
   * Creates a bar chart from the given data set.
   *
   * @class
   * @param {array} params from semantics, contains data set
   * @param {H5P.jQuery} $wrapper
   */
  function BarChart(params, $wrapper) {
    var self = this;
    var dataSet = params.listOfTypes;

    var defColors = d3.scale.ordinal()
      .range(["#90EE90", "#ADD8E6", "#FFB6C1", "#B0C4DE", "#D3D3D3", "#20B2AA", "#FAFAD2"]);

    // Create scales for bars
    var xScale = d3.scale.ordinal()
      .domain(d3.range(dataSet.length));

    var yScale = d3.scale.linear()
      .domain([0, d3.max(dataSet, function (d) {
        return d.value;
      })]);

    var x = d3.time.scale();
    var y = d3.scale.linear();

    var xAxis = d3.svg.axis()
      .scale(xScale)
      .orient("bottom")
      .tickFormat(function (d) {
        return dataSet[d % dataSet.length].text;
      });

    // Create SVG element
    var svg = d3.select($wrapper[0])
      .append("svg");

    svg.append("desc").html("chart");

    // Create x axis
    var xAxisG = svg.append("g")
      .attr("class", "x-axis");

    /**
     * @private
     */
    var key = function (d) {
      return dataSet.indexOf(d);
    };

    // Create rectangles for bars
    var rects = svg.selectAll("rect")
      .data(dataSet, key)
      .enter()
      .append("rect")
      .attr("fill", function(d) {
        if (d.color !== undefined) {
          return d.color;
        }
        return defColors(dataSet.indexOf(d) % 7);
      });

    // Create labels
    var texts = svg.selectAll("text")
      .data(dataSet, key)
      .enter()
      .append("text")
      .text(function(d) {
        return d.value;
      })
      .attr("text-anchor", "middle")
      .attr("fill", function (d) {
        if (d.fontColor !== undefined) {
          return d.fontColor;
        }
        return '000000';
      })
      .attr("aria-hidden", true);

    /**
     * Fit the current bar chart to the size of the wrapper.
     */
    self.resize = function () {
      // Always scale to available space
      var style = window.getComputedStyle($wrapper[0]);
      const width = Math.round(parseFloat(style.width));
      const h = Math.round(parseFloat(style.height));
      const fontSize = Math.round(parseFloat(style.fontSize));
      const lineHeight = Math.ceil(1.25 * fontSize);
      const tickSize = Math.round(fontSize * 0.125);
      const extra = 4; // tiny Safari buffer
      const height = h - tickSize - lineHeight - extra; // Add space for labels below

      // Update SVG size
      svg.attr("width", width)
        .attr("height", h);

      // Update scales
      xScale.rangeRoundBands([0, width], 0.05);
      yScale.range([0, height]);

      x.range([0, width]);
      y.range([height, 0]);

      xAxis.tickSize([tickSize]);
      xAxis.tickPadding(Math.ceil(fontSize * 0.25));

      // 1) First pass: quick guess
      xAxisG.attr("transform", "translate(0," + height + ")")
        .call(xAxis);

      xAxisG.selectAll(".tick text")
        .style("font-size", fontSize + "px")
        .attr("dy", "0.71em");

      // 2) Measure tick label height
      var maxTickH = 0;
      xAxisG.selectAll(".tick text").each(function() {
        var bb = this.getBBox ? this.getBBox() : null;
        if (bb && bb.height > maxTickH) maxTickH = bb.height;
      });

      // 3) Recompute bottom margin with real size + buffer
      var bottomMargin = Math.ceil(maxTickH + tickSize + extra);
      var newHeight = h - bottomMargin;

      var chartH = (newHeight !== height) ? newHeight : height;

      // Ensure scales use the final height
      yScale.range([0, chartH]);
      y.range([chartH, 0]);

      // Axis at the final spot
      xAxisG.attr("transform", "translate(0," + chartH + ")").call(xAxis);
      xAxisG.selectAll(".tick text")
        .style("font-size", fontSize + "px")
        .attr("dy", "0.71em");

      // Bars — update with final height
      rects
        .attr("x", function(d, i) { return xScale(i); })
        .attr("y", function(d) { return chartH - yScale(d.value); })
        .attr("width", xScale.rangeBand())
        .attr("height", function(d) { return yScale(d.value); });

      // Re-locate text value labels
      texts
        .attr("x", function(d, i) { return xScale(i) + xScale.rangeBand() / 2; })
        .attr("y", function(d) { return chartH - yScale(d.value) + Math.ceil(1.25 * fontSize); });

      // Hide ticks from readspeakers, the entire rectangle is already labelled
      xAxisG.selectAll("text").attr("aria-hidden", true);
    };
  }

  return BarChart;
})();
