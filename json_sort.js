"use strict";

const args               = process.argv
                                  .map((arg) => (
                                                  arg.replace(/\"/gm,"")
                                                     .trim()
                                                )
                                  )
                                  .filter((arg) => (
                                                      (arg.length > 0)                              //when Windows-CMD sends arguments using %* is sometimes breaks them, make sure to use "%~1" "%~2" "%~3" "%~4" "%~5" "%~6" "%~7" "%~8" "%~9" instead of %* (limited to 9 arguments).
                                                    &&(false === /[\/\\]node/i.test(arg))           //ignore node.exe (or linux/mac node), based on the fact that the args have a full path
                                                    &&(false === /[\/\\]json_sort\.js/i.test(arg))  //ignore this specific script.
                                                    &&( -1 === arg.toLowerCase().indexOf(process.mainModule.filename.toLowerCase()) )   //same as above, more generic.
                                                   )
                                  )
     ,ARGS_DELIMITER     = "####" //something that would probably never be a part of a real file-name or path...  similar to how arguments are sent to programs from the shell with \0
     ,args_str           = ARGS_DELIMITER + args.join(ARGS_DELIMITER) + ARGS_DELIMITER  //helps you search the arguments as a long string.
     ,NEWLINE            = (-1 !== args_str.indexOf(ARGS_DELIMITER + "--eol-win" + ARGS_DELIMITER)) ? "\r\n"
                            : (
                               (-1 !== args_str.indexOf(ARGS_DELIMITER + "--eol-linux" + ARGS_DELIMITER)) ? "\n" : require("os").EOL
                              )
     ;


console.error("identified arguments:", args);
//console.error(args_str);
     
const IS_DEBUG_MODE      = (-1 !== args_str.indexOf(ARGS_DELIMITER + "--verbose" + ARGS_DELIMITER))   //master-switch for using the 'log' method below, helps preventing too much output in the STDERR pipe, and keeping it in for its original use of error messages from node.
     ,err                = console.error.bind(console)
                                                                    //debug logs, uses STDERR pipe for information messages.  for STDOUT use console.out directly (can be used for actual output from the program)
     ,log                = (true === IS_DEBUG_MODE) ? err : (function(){}) //do nothing.
     ;

if(-1 !== args_str.indexOf(ARGS_DELIMITER + "--help" + ARGS_DELIMITER)){
  console.log( //uses console.log instead of log, since this is a desired output.
      [
      ,"json_sort"
      ,"═════════════"
      ,"deep-sort JSON files."
      ,"handles plain text files too."
      ,"═════════════════════════════════"
      ,"uses natural sort, and writes new files "
      ,"with '_sorted' add to file-name (same extension)."
      ,"═════════════════════════════════════════════════════"
      ,' "file" "file"..    ' + "\t" + "read, sort (natural), write new file. on errors, skip."
      ," --unique           " + "\t" + "remove duplicates (lines in text/values in arrays)."
      ," --no-beautify      " + "\t" + "json output will not be beautified."
      ," --eol-win          " + "\t" + "force \\r\\n (CR+LF) everywhere, instead of your OS defaults."
      ," --eol-linux        " + "\t" + "force   \\n    (LF) everywhere, instead of your OS defaults."
      ," --help             " + "\t" + "show this help."
      ," --verbose          " + "\t" + "show some debug information (written to STDERR)."
      ,"════════════════════════════════════════════════════════════════"
      ,"                                               EladKarako 2022."
      ].join(NEWLINE) + NEWLINE
     );

  process.exitCode=0;
  process.exit();
}

function beautify(o){
  return JSON.stringify(o, null, 2)        //built-in beautifier (null for unused additional process-function, 2 for two whitespace).
             .replace(/[\r\n]+/gm, "\n")   //normalize to Linux EOL, for the sake of next regular-expression .
             .replace(/,\n /g, "\n ,")     //put ',' in the next line (the other side of the \r\n) .
             .replace(/ *(,( +))/g,"$2,")  //preserve the whitespace before ',' .
             .replace(/\n+/gm, NEWLINE)     //normalize to Windows EOL.
             ;
}

function natural_compare(a, b){
  var ax=[], bx=[];
  
  if("function" === typeof natural_compare.extraction_rule){  //- sometimes comparing the whole line isn't useful.
    a = natural_compare.extraction_rule(a);
    b = natural_compare.extraction_rule(b);
  }
  
  //numbers can be normalized (original value is fine, - it is just another kind of extraction-rule.
  a = ("number" === typeof a) ? String(a) : a;  
  b = ("number" === typeof b) ? String(b) : b;
  
  //but not much else..
  if("string" !== typeof a){return 0;}
  if("string" !== typeof b){return 0;}
  
  a.replace(/(\d+)|(\D+)/g, function(_, $1, $2){ ax.push([$1 || Infinity, $2 || ""]); });
  b.replace(/(\d+)|(\D+)/g, function(_, $1, $2){ bx.push([$1 || Infinity, $2 || ""]); });

  while(ax.length > 0 && bx.length > 0){
    var an, bn, nn;
    
    an = ax.shift();
    bn = bx.shift();
    nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
    if(nn) return nn;
  }
  return ax.length - bx.length;
}


const is_to_unique       = (-1 !== args_str.indexOf(ARGS_DELIMITER + "--unique"      + ARGS_DELIMITER))
     ,is_to_beautify     = (-1 === args_str.indexOf(ARGS_DELIMITER + "--no-beautify" + ARGS_DELIMITER))
     ;


const path               = require("path")
     ,parse_path         = path.parse.bind(path)
     ,resolve_path       = function(input){
                             input = input.replace(/[\/\\]+/g,"/").replace(/\"/g,"");  //single forward-slash to help resolve.
                             input = path.resolve(input).replace(/[\/\\]+/g,"/");      //resolve + normalize to forward-slash.
                             input = input.replace(/\/+$/g,"");                        //normalize to no slash at the end (folders).
                             return input;
                           }
     ,fs                 = require("fs")
     ,is_access          = function(path){
                             try{
                               fs.accessSync(path, (fs.R_OK || fs.constants.R_OK));
                               return true;
                             }catch(err){
                               return false;
                             }
                           }
     ,stats              = function(path){
                             return fs.lstatSync(path, {"bigint"         : false
                                                       ,"throwIfNoEntry" : false
                                                       }
                                                 );
                           }
     ,file_read          = function(path, is_binary){
                             return fs.readFileSync(path, {"encoding" : (true === is_binary ? null : "utf8")
                                                          ,"signal"   : AbortSignal.timeout(10 * 1000)
                                                          }
                                                    );
                           }
     ,file_write         = function(path, content, is_binary){
                             return fs.writeFileSync(path, content, {"encoding" : (true === is_binary ? null : "utf8")
                                                                    ,"signal"   : AbortSignal.timeout(10 * 1000)
                                                                    ,"flag"     : "w"
                                                                    }
                                                    );
                           }

     ,files              = (function(){
                             const files = [];
                             args.forEach(function(file){
                                    const o   = new Object(null)
                                         ,tmp = file
                                         ;
                                    file = resolve_path(tmp);
                                    file = parse_path(file);
                                    file.original = tmp;
                                    file.full     = resolve_path(tmp);
                                    file.output   = resolve_path(file.dir + "/" + file.name + "_sorted" + file.ext);
                                    
                                    if(false === is_access(file.full)){ 
                                      log("[NODE][INFO] can not access [" + file.full + "], skip.");
                                      //in here you can determin that you want to hard-break instead of skipping, you can either throw an error or directly set the exit code to not zero, and exit.
                                      return;
                                    }
                                    
                                    file.stats = stats(file.full);
                                    file.is_file = file.stats.isFile();
                                    if(false === file.is_file){ 
                                      //in here you can determin that you want to hard-break instead of skipping, you can either throw an error or directly set the exit code to not zero, and exit.
                                      log("[NODE][INFO] it is not a file [" + file.full + "], skip.");
                                      return;
                                    }

                                    file.content = file_read(file.full);
                                   
                                    files.push(file);
                                });
                             return files;
                           })()
     ;


log("success pre-reading all files.", files);


//recursive!!!
//drill down to the last sub tree, than sort when back up.
function recursive_sort(o){
  log("trying to sort: ", o);
  
  if("object"    !== typeof o 
  || "undefined" === typeof o.constructor
  || "undefined" === typeof o.constructor.name){
    log("not array nor object. skip.."); 
    return o; 
  }
  
  if("array"  !== o.constructor.name.toLowerCase()
  && "object" !== o.constructor.name.toLowerCase()){ 
    log("constructor name is not array nor object");
  }

  if("array"  === o.constructor.name.toLowerCase()){
    if(true === is_to_unique){
      log("done removing duplicates, before:", o);
      
      let unique             = new Object(null)  //abuse object-insertion being unique by design.
         ,items_non_key_like = []                //sub-array or other stuff that can not be used as keys - just collect them and add at the end.
         ;
      o.forEach((item) => { 
        if("string" === typeof item){
          unique[ item ] = 123; 
        }else if("number" === typeof item){
          unique[ String(item) ] = 123; 
        }else{
          items_non_key_like.push(item);
        }
      });
      unique = Object.keys(unique); //to array again. but now it has no duplicates.
      o = [].concat(unique, items_non_key_like);
      
      log("done removing duplicates, after:", o);
    }
    
    //sorting its sub-tree using recursive_sort.
    o = o.map((item) => {
          return recursive_sort(item);
        });

    //sorting current array by values.
    o = o.sort(natural_compare);

    log("success sorting array by its values: ", o);
    return o;
  }
  
  if("object"  === o.constructor.name.toLowerCase()){
    //sorting its sub-tree first (walking through object by its keys).
    Object.keys(o)
          .forEach((key) => {
            o[key] = recursive_sort( o[key] );
          });

    //sorting current object by keys.
    const tmp = (new Object(null));
    Object.keys(o)
          .sort(natural_compare)
          .forEach((key) => {
            tmp[key] = o[key];  //"sort" by insertion (order of insertion is kept, order is dictated by '.sort(natural_compare)' in previous line, so it isn't the original order of keys..).
          })
    o = tmp;
    
    log("success sorting object by its keys: ", o);
    return o;
  }
  
  //--- will never reach here!
}



files.forEach((file) => {
  let o
     ,is_text = false
     ;
  //parse the text as array or json             - at the end it will stringify using JSON.stringify
  //otherwise minimum-parse as a multiline text - at the end it will be just "glued-back" using new-line characters back to text.

  
  log("processing file..", file);

  try{
    o = JSON.parse( file.content );
    log("success parsing content as JSON");
  }catch(err){
    o = file.content
            .replace(/\r+/gm, "") //normalize to linux eol for the sake of simplicity.
            .split("\n")
    is_text = true;
    log("can not parse as JSON, read as text file.");
  }


  log("before", o);
  
  o = recursive_sort(o);
  
  log("after", o);

  
  o = (true === is_text) ? o.join(NEWLINE) : (true === is_to_beautify ? beautify(o) : JSON.stringify(o));
  
  
  if(false === is_access(file.output)){
    log("[NODE][INFO] writing new file [" + file.output + "]");
  } else {
    log("[NODE][INFO] overwriting existing file [" + file.output + "]");
  }
  
  file_write(file.output, o);
  
  if(false === is_access(file.output)){
    log("[NODE][INFO] file [" + file.output + "] is not available, probably write-error..");
  }

});


process.exitCode=0;
process.exit();

