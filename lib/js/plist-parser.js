class PListParser {
  shouldIgnoreNode(node) {
    return node.nodeType === 3 // text
        || node.nodeType === 4 // cdata
        || node.nodeType === 8; // comment
  }

  isEmptyNode(node) {
    return !node.childNodes || node.childNodes.length === 0;
  }

  parse(xml) {
    try {
      var doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.documentElement.nodeName !== 'plist') {
        throw "First element should be <plist>";
      }
      
      var plist = this.parseNode(doc.documentElement);
      if (plist.length == 1) plist = plist[0];
      return plist;
    
    } catch (err) {
      error("ttr2_track parse error: " + err);
      return null;
    }
  }

  parseNode(node) {
    if (!node) return null;

    if (node.nodeName === 'plist') {
      var arr = [];
      if (this.isEmptyNode(node)) return arr;
      
      for (var i = 0; i < node.childNodes.length; i++) {
        if (!this.shouldIgnoreNode(node.childNodes[i])) {
          arr.push(this.parseNode(node.childNodes[i]));
        }
      }
      return arr;
    } else if (node.nodeName === 'dict') {
      var obj = {};
      var key = null;
      var counter = 0;
      if (this.isEmptyNode(node)) return obj;
      
      for (var i = 0; i < node.childNodes.length; i++) {
        if (this.shouldIgnoreNode(node.childNodes[i])) continue;
        
        if (counter % 2 === 0) {
          if (node.childNodes[i].nodeName !== 'key') {
            throw "Missing key while parsing <dict>";
          }
          key = this.parseNode(node.childNodes[i]);
        } else if (node.childNodes[i].nodeName === 'key') {
          throw "Unexpected key while parsing <dict>";
        } else {
          obj[key] = this.parseNode(node.childNodes[i]);
        }
        counter += 1;
      }
      if (counter % 2 === 1) {
        throw "Missing value for " + key + " while parsing <dict>";
      }
      return obj;

    } else if (node.nodeName === 'array') {
      var arr = [];
      if (this.isEmptyNode(node)) return arr;
      
      for (var i = 0; i < node.childNodes.length; i++) {
        if (!this.shouldIgnoreNode(node.childNodes[i])) {
          res = this.parseNode(node.childNodes[i]);
          if (null != res) arr.push(res);
        }
      }
      return arr;

    } else if (node.nodeName === '#text') {
      // don't really care about these
      return null;

    } else if (node.nodeName === 'key') {
      if (this.isEmptyNode(node)) return '';
      
      return node.childNodes[0].nodeValue;
    } else if (node.nodeName === 'string') {
      var res = '';
      if (this.isEmptyNode(node)) return res;
      
      for (var i = 0; i < node.childNodes.length; i++) {
        var type = node.childNodes[i].nodeType;
        if (type === 3 || type === 4) { // text or cdata
          res += node.childNodes[i].nodeValue;
        }
      }
      
      return res;
      
    } else if (node.nodeName === 'integer') {
      if (this.isEmptyNode(node)) throw "Cannot parse \"\" as integer"; 
         
      return parseInt(node.childNodes[0].nodeValue, 10);

    } else if (node.nodeName === 'real') {
      if (this.isEmptyNode(node)) throw "Cannot parse \"\" as real";
      var res = '';
      for (var i = 0; i < node.childNodes.length; i++) {
        if (node.childNodes[i].nodeType === 3) { // text
          res += node.childNodes[i].nodeValue;
        }
      }
      
      return parseFloat(res);
      
    } else if (node.nodeName === 'data') {
      var res = '';
      if (this.isEmptyNode(node)) return atob(res);
      
      for (var i = 0; i < node.childNodes.length; i++) {
        if (node.childNodes[i].nodeType === 3) { // text
          res += node.childNodes[i].nodeValue.replace(/\s+/g, '');
        }
      }
      
      return atob(res);

    } else if (node.nodeName === 'date') {
      if (this.isEmptyNode(node)) throw "Cannot parse \"\" as Date";

      return new Date(node.childNodes[0].nodeValue);

    } else if (node.nodeName === 'true') {
      return true;

    } else if (node.nodeName === 'false') {
      return false;
    }
  }
}
