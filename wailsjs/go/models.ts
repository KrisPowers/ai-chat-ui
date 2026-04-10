export namespace storage {
	
	export class AppSettings {
	    defaultModel: string;
	    defaultChatPreset: string;
	    defaultReasoningEffort: string;
	    developerToolsEnabled: boolean;
	    advancedUseEnabled: boolean;
	    ollamaEndpoint: string;
	    openAIApiKey: string;
	    anthropicApiKey: string;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.defaultModel = source["defaultModel"];
	        this.defaultChatPreset = source["defaultChatPreset"];
	        this.defaultReasoningEffort = source["defaultReasoningEffort"];
	        this.developerToolsEnabled = source["developerToolsEnabled"];
	        this.advancedUseEnabled = source["advancedUseEnabled"];
	        this.ollamaEndpoint = source["ollamaEndpoint"];
	        this.openAIApiKey = source["openAIApiKey"];
	        this.anthropicApiKey = source["anthropicApiKey"];
	    }
	}
	export class Snapshot {
	    settings: AppSettings;
	    workspaces: any[];
	    chats: any[];
	    replyPreferences: any[];
	
	    static createFrom(source: any = {}) {
	        return new Snapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.settings = this.convertValues(source["settings"], AppSettings);
	        this.workspaces = source["workspaces"];
	        this.chats = source["chats"];
	        this.replyPreferences = source["replyPreferences"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

